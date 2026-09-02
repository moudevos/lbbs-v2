-- El descuento obligatorio se calcula sobre el total de producción que
-- genera la liquidación, antes de deudas, ajustes u otros descuentos.
-- Además, un admin asignado a una sede queda limitado a esa sede para el
-- historial y las sesiones POS. Owner y admin sin sede asignada son globales.

create or replace function public.can_view_pos_branch(target_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    public.is_owner()
    or (
      public.current_user_role() = 'admin'
      and (
        public.current_branch_id() is null
        or public.current_branch_id() = target_branch_id
      )
    )
    or (
      public.current_user_role() = 'reception'
      and public.can_access_branch(target_branch_id)
    ),
    false
  )
$$;

create or replace function public.can_manage_pos_branch(target_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    public.is_owner()
    or (
      public.current_user_role() = 'admin'
      and (
        public.current_branch_id() is null
        or public.current_branch_id() = target_branch_id
      )
    )
    or (
      public.current_user_role() = 'reception'
      and public.can_access_branch(target_branch_id)
    ),
    false
  )
$$;

create or replace function public.apply_settlement_mandatory_discount()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.mandatory_discount_rate := greatest(coalesce(new.mandatory_discount_rate, 1), 0);
  new.net_before_mandatory_discount := greatest(
    round(coalesce(new.gross_pay_amount, 0) - coalesce(new.debt_deduction_total, 0), 2),
    0
  );
  new.mandatory_discount_amount := round(
    greatest(coalesce(new.gross_pay_amount, 0), 0) * new.mandatory_discount_rate / 100,
    2
  );
  new.net_pay_amount := greatest(
    new.net_before_mandatory_discount - new.mandatory_discount_amount,
    0
  );
  return new;
end;
$$;

create or replace function public.review_employee_settlement(
  p_settlement_id uuid,
  p_adjustments jsonb default '[]'::jsonb
)
returns public.employee_settlements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settlement public.employee_settlements%rowtype;
  v_adjustment jsonb;
  v_type text;
  v_description text;
  v_amount numeric(12,2);
  v_bonus numeric(12,2) := 0;
  v_deduction numeric(12,2) := 0;
  v_before numeric(12,2);
  v_mandatory numeric(12,2);
  v_employee uuid := public.current_employee_id();
begin
  if not (public.is_owner() or public.is_admin()) then
    raise exception 'Solo owner o admin pueden revisar liquidaciones.';
  end if;

  select * into v_settlement
  from public.employee_settlements
  where id = p_settlement_id
  for update;

  if not found or v_settlement.status <> 'draft' then
    raise exception 'Solo una liquidacion en borrador puede revisarse.';
  end if;

  delete from public.employee_settlement_adjustments
  where settlement_id = p_settlement_id;

  for v_adjustment in
    select * from jsonb_array_elements(coalesce(p_adjustments, '[]'::jsonb))
  loop
    v_type := v_adjustment ->> 'adjustment_type';
    v_description := nullif(btrim(coalesce(v_adjustment ->> 'description', '')), '');
    v_amount := round(coalesce((v_adjustment ->> 'amount')::numeric, 0), 2);

    if v_type not in ('bonus', 'deduction') or v_description is null or v_amount <= 0 then
      raise exception 'Cada ajuste necesita tipo, motivo y monto mayor a cero.';
    end if;

    insert into public.employee_settlement_adjustments (
      settlement_id, adjustment_type, description, amount, created_by
    ) values (
      p_settlement_id, v_type, v_description, v_amount, v_employee
    );

    if v_type = 'bonus' then
      v_bonus := v_bonus + v_amount;
    else
      v_deduction := v_deduction + v_amount;
    end if;
  end loop;

  v_before := greatest(
    v_settlement.gross_pay_amount + v_bonus - v_settlement.debt_deduction_total - v_deduction,
    0
  );
  v_mandatory := round(
    greatest(coalesce(v_settlement.gross_pay_amount, 0), 0)
      * coalesce(v_settlement.mandatory_discount_rate, 1) / 100,
    2
  );

  update public.employee_settlements
  set manual_bonus_total = v_bonus,
      other_deduction_total = v_deduction,
      net_before_mandatory_discount = v_before,
      mandatory_discount_amount = v_mandatory,
      net_pay_amount = greatest(v_before - v_mandatory, 0),
      status = 'review',
      reviewed_by = v_employee,
      reviewed_at = now()
  where id = p_settlement_id
  returning * into v_settlement;

  return v_settlement;
end;
$$;

notify pgrst, 'reload schema';
