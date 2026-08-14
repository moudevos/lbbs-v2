-- Cierre POS atómico. Una llamada de función PostgreSQL se ejecuta como una
-- sola transacción: si falla un paso, no se conserva venta, item, pago ni reward.

create or replace function public.checkout_pos_sale(p_payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_sale_id uuid;
  v_session public.pos_sessions%rowtype;
  v_employee_id uuid := public.current_employee_id();
  v_item jsonb;
  v_payment jsonb;
  v_final_total numeric(12,2);
  v_paid_total numeric(12,2);
  v_pos_session_id uuid := (p_payload ->> 'pos_session_id')::uuid;
  v_branch_id uuid := (p_payload ->> 'branch_id')::uuid;
  v_customer_id uuid := (p_payload ->> 'customer_id')::uuid;
  v_barber_id uuid := nullif(p_payload ->> 'barber_id', '')::uuid;
  v_reservation_id uuid := nullif(p_payload ->> 'reservation_id', '')::uuid;
  v_reward_entitlement_id uuid := nullif(p_payload ->> 'reward_entitlement_id', '')::uuid;
begin
  if v_employee_id is null or not public.can_manage_pos_branch(v_branch_id) then
    raise exception 'No tienes permisos para cerrar ventas en esta sede.';
  end if;

  select * into v_session
  from public.pos_sessions
  where id = v_pos_session_id
    and branch_id = v_branch_id
  for update;

  if not found or v_session.status <> 'open' then
    raise exception 'La sesion POS ya esta cerrada.';
  end if;

  if jsonb_typeof(coalesce(p_payload -> 'items', 'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_payload -> 'items') = 0 then
    raise exception 'La venta debe incluir al menos un item.';
  end if;

  insert into public.sales (
    pos_session_id, branch_id, customer_id, reservation_id, barber_id, status,
    subtotal, discount_total, courtesy_total, total, paid_total, change_amount,
    checkout_idempotency_key, notes, created_by
  ) values (
    v_pos_session_id, v_branch_id, v_customer_id, v_reservation_id, v_barber_id, 'draft',
    coalesce((p_payload ->> 'subtotal')::numeric, 0),
    coalesce((p_payload ->> 'discount_total')::numeric, 0),
    coalesce((p_payload ->> 'courtesy_total')::numeric, 0),
    coalesce((p_payload ->> 'total')::numeric, 0),
    coalesce((p_payload ->> 'paid_total')::numeric, 0),
    coalesce((p_payload ->> 'change_amount')::numeric, 0),
    nullif(p_payload ->> 'idempotency_key', ''),
    nullif(btrim(coalesce(p_payload ->> 'notes', '')), ''),
    v_employee_id
  ) returning id into v_sale_id;

  for v_item in select value from jsonb_array_elements(p_payload -> 'items')
  loop
    insert into public.sale_items (
      sale_id, item_type, service_id, product_id, description_snapshot, quantity,
      unit_price, discount_amount, total, cost_snapshot, barber_id, is_courtesy,
      courtesy_reason, courtesy_rule_id, courtesy_rule_name_snapshot,
      original_unit_price, original_total, courtesy_amount, courtesy_authorized_by
    ) values (
      v_sale_id,
      v_item ->> 'item_type',
      nullif(v_item ->> 'service_id', '')::uuid,
      nullif(v_item ->> 'product_id', '')::uuid,
      coalesce(nullif(v_item ->> 'description_snapshot', ''), 'Item POS'),
      (v_item ->> 'quantity')::numeric,
      (v_item ->> 'unit_price')::numeric,
      coalesce((v_item ->> 'discount_amount')::numeric, 0),
      (v_item ->> 'total')::numeric,
      nullif(v_item ->> 'cost_snapshot', '')::numeric,
      nullif(v_item ->> 'barber_id', '')::uuid,
      coalesce((v_item ->> 'is_courtesy')::boolean, false),
      nullif(v_item ->> 'courtesy_reason', ''),
      null,
      null,
      nullif(v_item ->> 'original_unit_price', '')::numeric,
      nullif(v_item ->> 'original_total', '')::numeric,
      nullif(v_item ->> 'courtesy_amount', '')::numeric,
      case when coalesce((v_item ->> 'is_courtesy')::boolean, false) then v_employee_id else null end
    );
  end loop;

  if v_reward_entitlement_id is not null then
    perform public.apply_reward_to_sale(v_sale_id, v_reward_entitlement_id);
  end if;

  select total into v_final_total from public.sales where id = v_sale_id;
  select coalesce(sum((value ->> 'amount')::numeric), 0) into v_paid_total
  from jsonb_array_elements(coalesce(p_payload -> 'payments', '[]'::jsonb));

  if round(v_paid_total, 2) <> round(coalesce(v_final_total, 0), 2) then
    raise exception 'El monto pagado no cubre el total final de la venta.';
  end if;

  for v_payment in select value from jsonb_array_elements(coalesce(p_payload -> 'payments', '[]'::jsonb))
  loop
    insert into public.sale_payments (
      sale_id, payment_method_id, amount, tendered_amount, change_amount
    ) values (
      v_sale_id,
      (v_payment ->> 'payment_method_id')::uuid,
      (v_payment ->> 'amount')::numeric,
      (v_payment ->> 'tendered_amount')::numeric,
      coalesce((v_payment ->> 'change_amount')::numeric, 0)
    );
  end loop;

  perform public.complete_sale(v_sale_id);
  return v_sale_id;
end;
$$;

revoke all on function public.checkout_pos_sale(jsonb) from public, anon;
grant execute on function public.checkout_pos_sale(jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
