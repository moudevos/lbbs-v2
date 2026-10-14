-- La clave representa una intención de creación manual, no atributos comerciales.
-- No modifica deudas históricas ni los flujos automáticos de créditos POS/insumos.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pgcrypto') then
    raise exception 'La extensión pgcrypto es obligatoria para la idempotencia de deudas.';
  end if;
end;
$$;

create table public.employee_debt_creation_requests (
  idempotency_key uuid primary key,
  request_fingerprint text not null,
  debt_id uuid null references public.employee_debts(id) on delete restrict,
  created_by uuid null references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz null
);

create index employee_debt_creation_requests_debt_id_idx
  on public.employee_debt_creation_requests(debt_id);

alter table public.employee_debt_creation_requests enable row level security;

-- La tabla es interna a la RPC; no se expone a clientes autenticados ni anónimos.
revoke all on table public.employee_debt_creation_requests from public, anon, authenticated;
grant all on table public.employee_debt_creation_requests to service_role;

create or replace function public.create_employee_debt_idempotent_v1(
  p_idempotency_key uuid,
  p_employee_id uuid,
  p_branch_id uuid,
  p_debt_type text,
  p_principal_amount numeric,
  p_interest_rate_percent numeric,
  p_description text,
  p_funding_origin text,
  p_cash_movement_id uuid,
  p_disbursements jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_request public.employee_debt_creation_requests%rowtype;
  v_debt public.employee_debts%rowtype;
  v_pos_result jsonb;
  v_normalized_disbursements jsonb;
  v_fingerprint text;
  v_normalized_description text;
  v_principal numeric(12,2);
  v_interest_rate numeric(9,4);
begin
  if p_idempotency_key is null then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;

  if p_debt_type not in ('loan', 'advance', 'penalty', 'administrative_charge') then
    raise exception 'El tipo de deuda no se puede registrar manualmente.';
  end if;

  if p_funding_origin not in ('pos_cash', 'external_cash', 'wallet_qr', 'bank_transfer') then
    raise exception 'El origen del desembolso no es válido.';
  end if;

  if p_funding_origin = 'pos_cash' and p_debt_type not in ('loan', 'advance') then
    raise exception 'Solo los adelantos y préstamos pueden usar una salida POS.';
  end if;

  if p_funding_origin = 'pos_cash' and p_cash_movement_id is null then
    raise exception 'La salida POS es obligatoria.';
  end if;

  if p_funding_origin <> 'pos_cash' and p_cash_movement_id is not null then
    raise exception 'Una deuda con desembolso externo no puede usar una salida POS.';
  end if;

  if jsonb_typeof(coalesce(p_disbursements, '[]'::jsonb)) <> 'array' then
    raise exception 'Los desembolsos deben ser una lista.';
  end if;

  v_principal := round(coalesce(p_principal_amount, 0), 2);
  v_interest_rate := coalesce(p_interest_rate_percent, 0);
  v_normalized_description := lower(regexp_replace(btrim(coalesce(p_description, '')), '\s+', ' ', 'g'));

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'amount', round(coalesce(nullif(item.value ->> 'amount', '')::numeric, 0), 2),
        'cashContext', nullif(btrim(coalesce(item.value ->> 'cashContext', '')), ''),
        'evidenceUrl', nullif(btrim(coalesce(item.value ->> 'evidenceUrl', '')), ''),
        'notes', nullif(btrim(coalesce(item.value ->> 'notes', '')), ''),
        'paymentMethodId', nullif(btrim(coalesce(item.value ->> 'paymentMethodId', '')), ''),
        'reference', nullif(btrim(coalesce(item.value ->> 'reference', '')), '')
      )
      order by
        nullif(btrim(coalesce(item.value ->> 'paymentMethodId', '')), ''),
        round(coalesce(nullif(item.value ->> 'amount', '')::numeric, 0), 2),
        nullif(btrim(coalesce(item.value ->> 'reference', '')), '')
    ),
    '[]'::jsonb
  )
  into v_normalized_disbursements
  from jsonb_array_elements(coalesce(p_disbursements, '[]'::jsonb)) as item(value);

  v_fingerprint := encode(
    extensions.digest(
      jsonb_build_object(
        'branchId', p_branch_id,
        'cashMovementId', p_cash_movement_id,
        'debtType', p_debt_type,
        'description', v_normalized_description,
        'disbursements', v_normalized_disbursements,
        'employeeId', p_employee_id,
        'fundingOrigin', p_funding_origin,
        'interestRatePercent', v_interest_rate,
        'principalAmount', v_principal
      )::text,
      'sha256'
    ),
    'hex'
  );

  -- Serializa dos POST concurrentes de la misma intención antes de consultar/insertar.
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));

  select *
  into v_request
  from public.employee_debt_creation_requests
  where idempotency_key = p_idempotency_key;

  if found then
    if v_request.request_fingerprint <> v_fingerprint then
      raise exception 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH' using errcode = 'P0001';
    end if;

    if v_request.debt_id is null then
      raise exception 'DEBT_CREATION_IN_PROGRESS' using errcode = 'P0001';
    end if;

    select * into v_debt from public.employee_debts where id = v_request.debt_id;
    if not found then
      raise exception 'DEBT_CREATION_FAILED' using errcode = 'P0001';
    end if;

    return jsonb_build_object('debt', to_jsonb(v_debt), 'idempotentReplay', true);
  end if;

  -- Este INSERT y todos los efectos financieros quedan en la misma transacción de la RPC.
  insert into public.employee_debt_creation_requests(
    idempotency_key, request_fingerprint, created_by
  ) values (
    p_idempotency_key, v_fingerprint, v_actor
  );

  if p_funding_origin = 'pos_cash' then
    v_pos_result := public.create_employee_debt_from_pos_cash_v2(
      p_employee_id,
      p_branch_id,
      p_debt_type,
      v_principal,
      v_interest_rate,
      p_description,
      p_cash_movement_id
    );

    select *
    into v_debt
    from public.employee_debts
    where id = (v_pos_result -> 'debt' ->> 'id')::uuid;
  elsif p_debt_type in ('loan', 'advance') then
    v_debt := public.create_employee_debt_with_disbursements_v2(
      p_employee_id,
      p_branch_id,
      p_debt_type,
      v_principal,
      v_interest_rate,
      p_description,
      coalesce(p_disbursements, '[]'::jsonb)
    );
  else
    v_debt := public.create_employee_debt_with_disbursements(
      p_employee_id,
      p_branch_id,
      p_debt_type,
      v_principal,
      p_description,
      '[]'::jsonb
    );
  end if;

  if v_debt.id is null then
    raise exception 'DEBT_CREATION_FAILED' using errcode = 'P0001';
  end if;

  update public.employee_debt_creation_requests
  set debt_id = v_debt.id,
      completed_at = now()
  where idempotency_key = p_idempotency_key;

  return jsonb_build_object('debt', to_jsonb(v_debt), 'idempotentReplay', false);
end;
$$;

revoke all on function public.create_employee_debt_idempotent_v1(uuid,uuid,uuid,text,numeric,numeric,text,text,uuid,jsonb) from public, anon;
grant execute on function public.create_employee_debt_idempotent_v1(uuid,uuid,uuid,text,numeric,numeric,text,text,uuid,jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
