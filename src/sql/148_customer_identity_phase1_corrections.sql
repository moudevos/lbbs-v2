-- Correcciones posteriores a 147_customer_identity_rewards_phase1.sql.
-- No recrea sus tablas ni recalcula Rewards históricos.

create or replace function public.get_customer_link_status()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.customer_link_requests%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select * into v_request
  from public.customer_link_requests
  where auth_user_id = auth.uid()
  order by requested_at desc
  limit 1;

  if not found then
    return jsonb_build_object('status', 'none');
  end if;

  if v_request.status = 'code_generated' and v_request.code_expires_at < now() then
    update public.customer_link_requests
    set status = 'expired', updated_at = now()
    where id = v_request.id and status = 'code_generated';
    return jsonb_build_object('status', 'expired', 'attemptsRemaining', greatest(5 - v_request.attempt_count, 0));
  end if;

  return jsonb_build_object(
    'status', v_request.status,
    'expiresAt', v_request.code_expires_at,
    'attemptsRemaining', case when v_request.status = 'code_generated' then greatest(5 - v_request.attempt_count, 0) else null end
  );
end;
$$;

-- Un bloqueo por identidad documental evita duplicar una ficha si el cliente
-- reintenta registro o dos solicitudes llegan al mismo tiempo.
create or replace function public.register_customer_identity(
  p_document_type text,
  p_document_number text,
  p_phone text,
  p_name text,
  p_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_doc text := public.normalize_customer_identity_document(p_document_number);
  v_doc_type text := nullif(btrim(p_document_type), '');
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_customer_count integer;
  v_type_count integer;
  v_customer_id uuid;
  v_request_id uuid;
begin
  if v_uid is null then raise exception 'Debes iniciar sesión con Google.'; end if;
  if length(v_doc) < 4 or length(v_phone) < 9 or length(btrim(coalesce(p_name, ''))) < 2 then
    raise exception 'Documento, teléfono y nombre son obligatorios.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('customer_identity:' || coalesce(v_doc_type, '') || ':' || v_doc, 0));

  if exists (select 1 from public.customer_accounts where auth_user_id = v_uid and status = 'active') then
    return jsonb_build_object('status', 'linked');
  end if;

  select count(*) into v_customer_count
  from public.customers
  where public.normalize_customer_identity_document(document_number) = v_doc and is_active;

  if v_customer_count = 0 then
    insert into public.customers(full_name, phone, phone_normalized, email, document_type, document_number, source, is_active)
    values (btrim(p_name), btrim(p_phone), v_phone, nullif(lower(btrim(p_email)), ''), v_doc_type, v_doc, 'manual', true)
    returning id into v_customer_id;
    insert into public.customer_accounts(customer_id, auth_user_id, status, verified_at)
    values (v_customer_id, v_uid, 'active', now());
    return jsonb_build_object('status', 'created');
  end if;

  if v_customer_count > 1 then
    select count(*) into v_type_count
    from public.customers
    where public.normalize_customer_identity_document(document_number) = v_doc
      and document_type = v_doc_type and is_active;
    if v_type_count <> 1 then
      raise exception 'Encontramos varias fichas con ese documento; el personal debe resolver la duplicidad.';
    end if;
  end if;

  select id into v_customer_id
  from public.customers
  where public.normalize_customer_identity_document(document_number) = v_doc
    and is_active
    and (v_customer_count = 1 or document_type = v_doc_type)
  order by created_at asc
  limit 1;

  insert into public.customer_link_requests(customer_id, auth_user_id, requested_document_type, requested_document_number, requested_phone, requested_email, requested_name)
  values (v_customer_id, v_uid, v_doc_type, v_doc, btrim(p_phone), nullif(lower(btrim(p_email)), ''), btrim(p_name))
  on conflict do nothing
  returning id into v_request_id;

  return jsonb_build_object('status', 'pending', 'request_id', v_request_id);
end;
$$;

create or replace function public.confirm_customer_link(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_request public.customer_link_requests%rowtype;
  v_account public.customer_accounts%rowtype;
begin
  if v_uid is null then raise exception 'Debes iniciar sesión.'; end if;
  if coalesce(p_code, '') !~ '^[0-9]{6}$' then raise exception 'Código incorrecto.'; end if;
  select * into v_request from public.customer_link_requests
  where auth_user_id = v_uid and status = 'code_generated'
  order by requested_at desc limit 1 for update;
  if not found then raise exception 'No hay un código de vinculación vigente.'; end if;
  if v_request.code_expires_at < now() then
    update public.customer_link_requests set status = 'expired', updated_at = now() where id = v_request.id;
    raise exception 'El código expiró.';
  end if;
  if v_request.attempt_count >= 5 then raise exception 'Se alcanzó el máximo de intentos.'; end if;
  if v_request.verification_code_hash <> extensions.crypt(p_code, v_request.verification_code_hash) then
    update public.customer_link_requests set attempt_count = attempt_count + 1, updated_at = now() where id = v_request.id;
    raise exception 'Código incorrecto.';
  end if;
  if exists (select 1 from public.customer_accounts where auth_user_id = v_uid or customer_id = v_request.customer_id) then
    raise exception 'El cliente ya está vinculado.';
  end if;
  insert into public.customer_accounts(customer_id, auth_user_id, status, verified_at)
  values (v_request.customer_id, v_uid, 'active', now()) returning * into v_account;
  update public.customer_link_requests
  set status = 'linked', linked_at = now(), verification_code_hash = null, code_expires_at = now(), updated_at = now()
  where id = v_request.id;
  return jsonb_build_object('status', 'linked', 'customer_id', v_account.customer_id);
end;
$$;

revoke all on function public.get_customer_link_status() from public, anon;
grant execute on function public.get_customer_link_status() to authenticated;
revoke all on function public.register_customer_identity(text, text, text, text, text), public.confirm_customer_link(text) from public, anon;
grant execute on function public.register_customer_identity(text, text, text, text, text), public.confirm_customer_link(text) to authenticated;

notify pgrst, 'reload schema';
