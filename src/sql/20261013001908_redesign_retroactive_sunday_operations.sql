-- Rediseño incremental de operaciones dominicales retroactivas.
-- Mantiene las ventas dominicales aisladas de sales/POS/producción/quincenas.

alter table public.sunday_sales_days
  add column if not exists opening_cash_amount numeric(12,2) not null default 0,
  add column if not exists opening_notes text,
  add column if not exists closing_notes text;

alter table public.sunday_sales
  add column if not exists entry_idempotency_key text,
  add column if not exists entry_payload_fingerprint text;

alter table public.sunday_sale_items
  add column if not exists original_unit_price numeric(12,2),
  add column if not exists discount_amount numeric(12,2) not null default 0,
  add column if not exists discount_type text;

update public.sunday_sale_items
set original_unit_price = coalesce(original_unit_price, unit_price),
    discount_amount = coalesce(discount_amount, 0)
where original_unit_price is null or discount_amount is null;

alter table public.sunday_sale_items
  alter column original_unit_price set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sunday_sales_days_opening_cash_amount_check'
      and conrelid = 'public.sunday_sales_days'::regclass
  ) then
    alter table public.sunday_sales_days
      add constraint sunday_sales_days_opening_cash_amount_check
      check (opening_cash_amount >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'sunday_sale_items_original_unit_price_check'
      and conrelid = 'public.sunday_sale_items'::regclass
  ) then
    alter table public.sunday_sale_items
      add constraint sunday_sale_items_original_unit_price_check
      check (original_unit_price >= 0 and discount_amount >= 0 and discount_amount <= original_unit_price * quantity);
  end if;
end;
$$;

create unique index if not exists sunday_sales_day_entry_idempotency_key_unique
  on public.sunday_sales (sunday_day_id, entry_idempotency_key)
  where entry_idempotency_key is not null;

create index if not exists sunday_sales_entry_idempotency_key_idx
  on public.sunday_sales (entry_idempotency_key)
  where entry_idempotency_key is not null;

-- Reemplaza la apertura anterior: permite transcribir domingos pasados, pero
-- no domingos futuros ni reaperturas silenciosas de una jornada cerrada.
drop function if exists public.open_sunday_sales_day(uuid, date);
create function public.open_sunday_sales_day(
  p_branch_id uuid,
  p_business_date date,
  p_opening_cash_amount numeric,
  p_opening_notes text default null
)
returns public.sunday_sales_days
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_day public.sunday_sales_days%rowtype;
  v_actor uuid := public.current_employee_id();
  v_rate numeric(7,4);
  v_today date := (now() at time zone 'America/Lima')::date;
begin
  if not public.can_manage_sunday_sales_branch(p_branch_id) then
    raise exception 'No tienes permisos para gestionar domingos en esta sede.';
  end if;
  if p_business_date is null or extract(isodow from p_business_date) <> 7 then
    raise exception 'La jornada debe corresponder a un domingo.';
  end if;
  if p_business_date > v_today then
    raise exception 'No se puede abrir una jornada dominical futura.';
  end if;
  if coalesce(p_opening_cash_amount, -1) < 0 then
    raise exception 'El monto inicial no puede ser negativo.';
  end if;

  select * into v_day
  from public.sunday_sales_days
  where branch_id = p_branch_id and business_date = p_business_date
  for update;

  if found then
    return v_day;
  end if;

  select default_commission_rate into v_rate
  from public.sunday_sales_settings
  where id = true;

  insert into public.sunday_sales_days (
    branch_id, business_date, commission_rate, opening_cash_amount,
    opening_notes, created_by
  )
  values (
    p_branch_id, p_business_date, least(greatest(coalesce(v_rate, 60), 50), 65),
    round(coalesce(p_opening_cash_amount, 0), 2),
    nullif(btrim(coalesce(p_opening_notes, '')), ''), v_actor
  )
  returning * into v_day;

  return v_day;
end;
$$;

create or replace function public.validate_sunday_sale_courtesies(p_sunday_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale public.sunday_sales%rowtype;
  v_qty numeric;
  v_cap numeric;
  v_amount numeric;
  v_amount_cap numeric;
  v_product_item record;
  v_product_capacity numeric;
begin
  select * into v_sale from public.sunday_sales where id = p_sunday_sale_id;
  if not found or not exists (
    select 1 from public.sunday_sale_items
    where sunday_sale_id = p_sunday_sale_id and item_type = 'product' and is_courtesy
  ) then
    return;
  end if;

  with matched_services as (
    select item.quantity, rule.maximum_courtesy_items, rule.maximum_courtesy_amount
    from public.sunday_sale_items item
    join public.sunday_sales_days day on day.id = v_sale.sunday_day_id
    cross join lateral (
      select r.*
      from public.courtesy_rules r
      where r.is_active
        and (r.branch_id is null or r.branch_id = v_sale.branch_id)
        and (r.starts_at is null or r.starts_at <= day.business_date::timestamptz)
        and (r.ends_at is null or r.ends_at >= day.business_date::timestamptz)
        and (r.qualifying_service_id is null or r.qualifying_service_id = item.service_id)
        and (r.qualifying_service_category_id is null or r.qualifying_service_category_id = (
          select category_id from public.services where id = item.service_id
        ))
        and item.unit_price >= r.minimum_unit_amount
      order by case when r.qualifying_service_id is not null then 2
                    when r.qualifying_service_category_id is not null then 1 else 0 end desc,
               r.minimum_unit_amount desc, r.priority desc, r.created_at desc
      limit 1
    ) rule
    where item.sunday_sale_id = p_sunday_sale_id
      and item.item_type = 'service'
      and not item.is_courtesy
  )
  select coalesce(sum(quantity * maximum_courtesy_items), 0),
         case when bool_or(maximum_courtesy_amount is null) then null
              else sum(quantity * maximum_courtesy_amount) end
  into v_cap, v_amount_cap
  from matched_services;

  select coalesce(sum(quantity), 0), coalesce(sum(quantity * original_unit_price), 0)
  into v_qty, v_amount
  from public.sunday_sale_items
  where sunday_sale_id = p_sunday_sale_id and item_type = 'product' and is_courtesy;

  if v_cap = 0 or v_qty > v_cap then
    raise exception 'La cantidad de productos en cortesía supera el cupo configurado para los servicios.';
  end if;
  if v_amount_cap is not null and v_amount > v_amount_cap then
    raise exception 'El importe de productos en cortesía supera el tope configurado.';
  end if;

  for v_product_item in
    select item.*, product.category_id
    from public.sunday_sale_items item
    join public.products product on product.id = item.product_id
    where item.sunday_sale_id = p_sunday_sale_id
      and item.item_type = 'product'
      and item.is_courtesy
  loop
    with matched_services as (
      select service_item.quantity, rule.id as rule_id, rule.maximum_courtesy_items
      from public.sunday_sale_items service_item
      join public.sunday_sales_days day on day.id = v_sale.sunday_day_id
      cross join lateral (
        select r.*
        from public.courtesy_rules r
        where r.is_active
          and (r.branch_id is null or r.branch_id = v_sale.branch_id)
          and (r.starts_at is null or r.starts_at <= day.business_date::timestamptz)
          and (r.ends_at is null or r.ends_at >= day.business_date::timestamptz)
          and (r.qualifying_service_id is null or r.qualifying_service_id = service_item.service_id)
          and (r.qualifying_service_category_id is null or r.qualifying_service_category_id = (
            select category_id from public.services where id = service_item.service_id
          ))
          and service_item.unit_price >= r.minimum_unit_amount
        order by case when r.qualifying_service_id is not null then 2
                      when r.qualifying_service_category_id is not null then 1 else 0 end desc,
                 r.minimum_unit_amount desc, r.priority desc, r.created_at desc
        limit 1
      ) rule
      where service_item.sunday_sale_id = p_sunday_sale_id
        and service_item.item_type = 'service'
        and not service_item.is_courtesy
    )
    select coalesce(sum(ms.quantity * coalesce(benefit.max_quantity, ms.maximum_courtesy_items)), 0)
    into v_product_capacity
    from matched_services ms
    left join public.courtesy_rule_benefits benefit
      on benefit.rule_id = ms.rule_id
     and benefit.is_active
     and benefit.benefit_item_type = 'product'
     and (benefit.product_id = v_product_item.product_id
          or benefit.product_category_id = v_product_item.category_id)
    where (benefit.id is not null
           and (benefit.max_unit_amount is null or v_product_item.original_unit_price <= benefit.max_unit_amount))
       or (
         benefit.id is null
         and exists (select 1 from public.products p where p.id = v_product_item.product_id and p.is_courtesy_allowed)
         and not exists (
           select 1 from public.courtesy_rule_benefits configured
           where configured.rule_id = ms.rule_id
             and configured.is_active
             and configured.benefit_item_type = 'product'
         )
       );

    if coalesce(v_product_capacity, 0) < v_product_item.quantity then
      raise exception 'El producto en cortesía no está permitido o supera su máximo configurado.';
    end if;
  end loop;
end;
$$;

drop function if exists public.register_sunday_sale(uuid, uuid, uuid, jsonb, jsonb, text);
create function public.register_sunday_sale(
  p_day_id uuid,
  p_customer_id uuid,
  p_barber_id uuid,
  p_items jsonb,
  p_payments jsonb,
  p_notes text default null,
  p_entry_idempotency_key text default null
)
returns public.sunday_sales
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_day public.sunday_sales_days%rowtype;
  v_sale public.sunday_sales%rowtype;
  v_actor uuid := public.current_employee_id();
  v_item jsonb;
  v_payment jsonb;
  v_service record;
  v_product record;
  v_quantity numeric(12,2);
  v_unit numeric(12,2);
  v_original_unit numeric(12,2);
  v_line_discount numeric(12,2);
  v_line_total numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2) := 0;
  v_courtesy numeric(12,2) := 0;
  v_paid numeric(12,2) := 0;
  v_contribution numeric(12,2);
  v_key text := nullif(btrim(coalesce(p_entry_idempotency_key, '')), '');
  v_fingerprint text;
begin
  if v_key is null or v_key !~ '^[A-Za-z0-9_-]{12,128}$' then
    raise exception 'La clave de idempotencia de la venta no es válida.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Registra al menos un servicio o producto.';
  end if;
  if jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) = 0 then
    raise exception 'Registra el pago de la venta.';
  end if;

  v_fingerprint := md5(jsonb_build_object(
    'customer_id', p_customer_id, 'barber_id', p_barber_id,
    'items', p_items, 'payments', p_payments, 'notes', nullif(btrim(coalesce(p_notes, '')), '')
  )::text);

  select * into v_day from public.sunday_sales_days where id = p_day_id for update;
  if not found or not public.can_manage_sunday_sales_branch(v_day.branch_id) then
    raise exception 'No tienes permisos para esta jornada dominical.';
  end if;
  if v_day.status <> 'open' then
    raise exception 'La jornada dominical ya está cerrada.';
  end if;
  if exists (select 1 from public.sunday_barber_settlements where sunday_day_id = p_day_id and status = 'paid') then
    raise exception 'No puedes registrar más ventas después de pagar a un barbero.';
  end if;

  select * into v_sale
  from public.sunday_sales
  where sunday_day_id = p_day_id and entry_idempotency_key = v_key;
  if found then
    if v_sale.entry_payload_fingerprint <> v_fingerprint then
      raise exception 'La clave de idempotencia ya fue usada con otro contenido.';
    end if;
    return v_sale;
  end if;

  if not exists (select 1 from public.customers where id = p_customer_id and is_active) then
    raise exception 'Selecciona un cliente activo.';
  end if;
  if not exists (
    select 1 from public.employees
    where id = p_barber_id and branch_id = v_day.branch_id and status = 'active'
  ) then
    raise exception 'Selecciona un barbero activo de esta sede.';
  end if;

  insert into public.sunday_sales (
    sunday_day_id, branch_id, customer_id, barber_id, notes, created_by,
    entry_idempotency_key, entry_payload_fingerprint
  ) values (
    p_day_id, v_day.branch_id, p_customer_id, p_barber_id,
    nullif(btrim(coalesce(p_notes, '')), ''), v_actor, v_key, v_fingerprint
  ) returning * into v_sale;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_quantity := round(coalesce((v_item ->> 'quantity')::numeric, 0), 2);
    if v_quantity <= 0 then
      raise exception 'Cada ítem necesita una cantidad válida.';
    end if;

    if v_item ->> 'item_type' = 'service' then
      select service.service_id, service.service_name, service.final_price
      into v_service
      from public.vw_services_effective_prices service
      where service.service_id = (v_item ->> 'service_id')::uuid
        and service.branch_id = v_day.branch_id
        and service.service_is_active;
      if not found then
        raise exception 'Uno de los servicios no está disponible en esta sede.';
      end if;
      v_original_unit := round(v_service.final_price, 2);
      v_line_discount := 0;
      v_unit := v_original_unit;
      v_line_total := round(v_unit * v_quantity, 2);
      v_contribution := case
        when public.is_operational_contribution_service_excluded((v_item ->> 'service_id')::uuid, v_day.business_date::timestamptz) then 0
        else least(v_line_total, round(v_quantity * public.calculate_operational_contribution(v_unit, v_day.business_date), 2))
      end;
      insert into public.sunday_sale_items (
        sunday_sale_id, item_type, service_id, description_snapshot, quantity,
        original_unit_price, unit_price, discount_amount, discount_type, total,
        operational_contribution_amount, commissionable_amount
      ) values (
        v_sale.id, 'service', (v_item ->> 'service_id')::uuid, v_service.service_name,
        v_quantity, v_original_unit, v_unit, v_line_discount, null, v_line_total,
        v_contribution, greatest(v_line_total - v_contribution, 0)
      );
      v_subtotal := v_subtotal + v_original_unit * v_quantity;
    elsif v_item ->> 'item_type' = 'product' then
      select stock.product_id, stock.product_name, stock.final_sale_price, stock.cost_price,
             stock.stock_quantity, stock.is_stockable, stock.is_courtesy_allowed
      into v_product
      from public.vw_product_stock stock
      where stock.product_id = (v_item ->> 'product_id')::uuid
        and stock.branch_id = v_day.branch_id
        and stock.is_active;
      if not found then
        raise exception 'Uno de los productos no está disponible en esta sede.';
      end if;
      if v_product.is_stockable and coalesce(v_product.stock_quantity, 0) < v_quantity then
        raise exception 'Stock insuficiente para %.', v_product.product_name;
      end if;
      v_original_unit := round(v_product.final_sale_price, 2);
      v_line_discount := 0;
      v_unit := v_original_unit;
      v_line_total := case when coalesce((v_item ->> 'is_courtesy')::boolean, false)
                           then 0 else round(v_unit * v_quantity, 2) end;
      insert into public.sunday_sale_items (
        sunday_sale_id, item_type, product_id, description_snapshot, quantity,
        original_unit_price, unit_price, discount_amount, discount_type, total,
        cost_snapshot, is_courtesy, courtesy_reason
      ) values (
        v_sale.id, 'product', (v_item ->> 'product_id')::uuid, v_product.product_name,
        v_quantity, v_original_unit, v_unit, v_line_discount, null, v_line_total,
        v_product.cost_price, coalesce((v_item ->> 'is_courtesy')::boolean, false),
        nullif(btrim(coalesce(v_item ->> 'courtesy_reason', '')), '')
      );
      v_subtotal := v_subtotal + v_original_unit * v_quantity;
      if coalesce((v_item ->> 'is_courtesy')::boolean, false) then
        v_courtesy := v_courtesy + v_original_unit * v_quantity;
      end if;
    else
      raise exception 'Tipo de ítem no válido.';
    end if;
  end loop;

  perform public.validate_sunday_sale_courtesies(v_sale.id);

  for v_payment in select value from jsonb_array_elements(p_payments) loop
    v_line_total := round(coalesce((v_payment ->> 'amount')::numeric, 0), 2);
    if v_line_total <= 0 then
      raise exception 'Cada pago debe ser mayor a cero.';
    end if;
    if not exists (
      select 1 from public.payment_methods
      where id = (v_payment ->> 'payment_method_id')::uuid
        and is_active and payment_kind <> 'internal_credit'
    ) then
      raise exception 'El método de pago no está disponible.';
    end if;
    insert into public.sunday_sale_payments (sunday_sale_id, payment_method_id, amount, reference)
    values (
      v_sale.id, (v_payment ->> 'payment_method_id')::uuid, v_line_total,
      nullif(btrim(coalesce(v_payment ->> 'reference', '')), '')
    );
    v_paid := v_paid + v_line_total;
  end loop;

  v_discount := 0;
  if round(v_paid, 2) <> round(v_subtotal - v_discount - v_courtesy, 2) then
    raise exception 'El monto pagado no cubre el total de la venta.';
  end if;

  insert into public.stock_movements (
    product_id, branch_id, movement_type, quantity, unit_cost,
    reference_type, reference_id, notes, created_by
  )
  select product_id, v_day.branch_id,
         case when is_courtesy then 'courtesy' else 'sale' end,
         quantity, coalesce(cost_snapshot, 0), 'sunday_sale', v_sale.id,
         case when is_courtesy then 'Cortesía de venta dominical.' else 'Venta dominical.' end,
         v_actor
  from public.sunday_sale_items item
  join public.products product on product.id = item.product_id
  where item.sunday_sale_id = v_sale.id
    and item.item_type = 'product'
    and product.is_stockable;

  update public.sunday_sales
  set subtotal = round(v_subtotal, 2),
      courtesy_total = round(v_courtesy, 2),
      total = round(v_subtotal - v_discount - v_courtesy, 2),
      paid_total = round(v_paid, 2)
  where id = v_sale.id
  returning * into v_sale;

  if public.is_rewards_customer_eligible(p_customer_id) then
    insert into public.customer_reward_ledger (
      customer_id, sunday_sale_id, movement_type, metric_type, quantity, amount,
      description, metadata, created_by
    ) values
      (p_customer_id, v_sale.id, 'accrual', 'sale_count', 1, 0,
       'Acumulación por venta dominical.', jsonb_build_object('sunday_day_id', p_day_id), v_actor),
      (p_customer_id, v_sale.id, 'accrual', 'amount_spent', 0, v_sale.total,
       'Acumulación por monto dominical.', jsonb_build_object('sunday_day_id', p_day_id), v_actor);

    if exists (select 1 from public.sunday_sale_items where sunday_sale_id = v_sale.id and item_type = 'service') then
      insert into public.customer_reward_ledger (
        customer_id, sunday_sale_id, movement_type, metric_type, quantity, amount,
        description, metadata, created_by
      ) values (
        p_customer_id, v_sale.id, 'accrual', 'service_visit_count', 1, 0,
        'Acumulación por atención dominical.', jsonb_build_object('sunday_day_id', p_day_id), v_actor
      );
      insert into public.customer_reward_ledger (
        customer_id, sunday_sale_id, movement_type, metric_type, quantity, amount,
        description, metadata, created_by
      )
      select p_customer_id, v_sale.id, 'accrual', 'specific_service_count', sum(item.quantity), 0,
             'Acumulación por servicio específico.',
             jsonb_build_object('service_id', item.service_id, 'sunday_day_id', p_day_id), v_actor
      from public.sunday_sale_items item
      where item.sunday_sale_id = v_sale.id and item.item_type = 'service'
      group by item.service_id;
    end if;
    if exists (
      select 1 from public.sunday_sale_items
      where sunday_sale_id = v_sale.id and item_type = 'product' and not is_courtesy
    ) then
      insert into public.customer_reward_ledger (
        customer_id, sunday_sale_id, movement_type, metric_type, quantity, amount,
        description, metadata, created_by
      ) values (
        p_customer_id, v_sale.id, 'accrual', 'product_purchase_count', 1, 0,
        'Acumulación por compra dominical.', jsonb_build_object('sunday_day_id', p_day_id), v_actor
      );
    end if;
    perform public.recalculate_customer_rewards(p_customer_id);
  end if;
  return v_sale;
end;
$$;

create or replace function public.reverse_rewards_for_cancelled_sunday_sale(p_sunday_sale_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale public.sunday_sales%rowtype;
  v_actor uuid := public.current_employee_id();
  v_row record;
  v_count integer := 0;
begin
  select * into v_sale from public.sunday_sales where id = p_sunday_sale_id;
  if not found then return 0; end if;

  for v_row in
    select * from public.customer_reward_ledger
    where sunday_sale_id = p_sunday_sale_id and movement_type = 'accrual'
  loop
    if not exists (
      select 1 from public.customer_reward_ledger reversed
      where reversed.sunday_sale_id = p_sunday_sale_id
        and reversed.movement_type = 'reversal'
        and reversed.metadata ->> 'reverses_ledger_id' = v_row.id::text
    ) then
      insert into public.customer_reward_ledger (
        customer_id, sunday_sale_id, rule_id, movement_type, metric_type,
        quantity, amount, description, metadata, created_by
      ) values (
        v_row.customer_id, p_sunday_sale_id, v_row.rule_id, 'reversal', v_row.metric_type,
        -coalesce(v_row.quantity, 0), -coalesce(v_row.amount, 0),
        'Reversión por anulación de venta dominical.',
        jsonb_build_object('reverses_ledger_id', v_row.id), v_actor
      );
      v_count := v_count + 1;
    end if;
  end loop;
  perform public.recalculate_customer_rewards(v_sale.customer_id);
  return v_count;
end;
$$;

create function public.cancel_sunday_sale(p_sunday_sale_id uuid, p_reason text)
returns public.sunday_sales
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale public.sunday_sales%rowtype;
  v_day public.sunday_sales_days%rowtype;
  v_actor uuid := public.current_employee_id();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into v_sale from public.sunday_sales where id = p_sunday_sale_id for update;
  if not found then raise exception 'La venta dominical no existe.'; end if;
  select * into v_day from public.sunday_sales_days where id = v_sale.sunday_day_id for update;
  if not public.can_manage_sunday_sales_branch(v_day.branch_id) then
    raise exception 'No tienes permisos para anular esta venta dominical.';
  end if;
  if v_day.status <> 'open' or v_sale.status <> 'completed' then
    raise exception 'Solo se pueden anular ventas completadas de una jornada abierta.';
  end if;
  if v_reason is null then raise exception 'Debes indicar el motivo de anulación.'; end if;
  if exists (
    select 1 from public.sunday_barber_settlements
    where sunday_day_id = v_sale.sunday_day_id and employee_id = v_sale.barber_id and status = 'paid'
  ) then
    raise exception 'No se puede anular: el pago dominical del barbero ya fue registrado.';
  end if;

  insert into public.stock_movements (
    product_id, branch_id, movement_type, quantity, unit_cost,
    reference_type, reference_id, notes, created_by
  )
  select item.product_id, v_sale.branch_id, 'adjustment', item.quantity,
         coalesce(item.cost_snapshot, product.cost_price),
         'sunday_sale_cancellation', v_sale.id,
         'Reversión de stock por anulación de venta dominical.', v_actor
  from public.sunday_sale_items item
  join public.products product on product.id = item.product_id
  where item.sunday_sale_id = v_sale.id
    and item.item_type = 'product'
    and product.is_stockable;

  update public.sunday_sales
  set status = 'cancelled', cancelled_by = v_actor, cancelled_at = now(), cancellation_reason = v_reason
  where id = v_sale.id
  returning * into v_sale;

  perform public.reverse_rewards_for_cancelled_sunday_sale(v_sale.id);
  perform public.prepare_sunday_settlements(v_sale.sunday_day_id);
  return v_sale;
end;
$$;

create or replace function public.prepare_sunday_settlements(p_day_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_day public.sunday_sales_days%rowtype;
  v_row record;
  v_actor uuid := public.current_employee_id();
  v_count integer := 0;
begin
  select * into v_day from public.sunday_sales_days where id = p_day_id for update;
  if not found or not public.can_manage_sunday_sales_branch(v_day.branch_id) then
    raise exception 'No tienes permisos para esta jornada dominical.';
  end if;
  if v_day.status <> 'open' then raise exception 'La jornada ya está cerrada.'; end if;

  for v_row in
    select sale.barber_id,
           round(coalesce(sum(item.quantity * item.unit_price) filter (where item.item_type = 'service'), 0), 2) as gross,
           round(coalesce(sum(item.operational_contribution_amount) filter (where item.item_type = 'service'), 0), 2) as contribution,
           round(coalesce(sum(item.commissionable_amount) filter (where item.item_type = 'service'), 0), 2) as base
    from public.sunday_sales sale
    join public.sunday_sale_items item on item.sunday_sale_id = sale.id
    where sale.sunday_day_id = p_day_id and sale.status = 'completed'
    group by sale.barber_id
  loop
    insert into public.sunday_barber_settlements (
      sunday_day_id, employee_id, branch_id, commission_rate,
      service_gross_total, operational_contribution_total, commissionable_base_total,
      payout_amount, created_by
    ) values (
      p_day_id, v_row.barber_id, v_day.branch_id,
      least(greatest(v_day.commission_rate, 50), 65),
      v_row.gross, v_row.contribution, v_row.base,
      round(v_row.base * least(greatest(v_day.commission_rate, 50), 65) / 100, 2), v_actor
    )
    on conflict (sunday_day_id, employee_id) do update
    set service_gross_total = excluded.service_gross_total,
        operational_contribution_total = excluded.operational_contribution_total,
        commissionable_base_total = excluded.commissionable_base_total,
        payout_amount = round(excluded.commissionable_base_total * public.sunday_barber_settlements.commission_rate / 100, 2)
    where public.sunday_barber_settlements.status = 'draft';
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create function public.set_sunday_barber_settlement_rate(
  p_settlement_id uuid,
  p_commission_rate numeric
)
returns public.sunday_barber_settlements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settlement public.sunday_barber_settlements%rowtype;
  v_day public.sunday_sales_days%rowtype;
begin
  select * into v_settlement from public.sunday_barber_settlements where id = p_settlement_id for update;
  if not found then raise exception 'El pago dominical no existe.'; end if;
  select * into v_day from public.sunday_sales_days where id = v_settlement.sunday_day_id for update;
  if not public.can_manage_sunday_sales_branch(v_day.branch_id) then raise exception 'No tienes permisos para este pago dominical.'; end if;
  if v_day.status <> 'open' or v_settlement.status <> 'draft' then
    raise exception 'Solo se puede cambiar el porcentaje de un pago pendiente en una jornada abierta.';
  end if;
  if coalesce(p_commission_rate, -1) < 50 or p_commission_rate > 65 then
    raise exception 'El porcentaje dominical debe estar entre 50 y 65.';
  end if;
  update public.sunday_barber_settlements
  set commission_rate = round(p_commission_rate, 4),
      payout_amount = round(commissionable_base_total * p_commission_rate / 100, 2)
  where id = v_settlement.id
  returning * into v_settlement;
  return v_settlement;
end;
$$;

create or replace function public.pay_sunday_settlement(
  p_settlement_id uuid,
  p_payment_method_id uuid,
  p_reference text default null,
  p_notes text default null
)
returns public.sunday_barber_settlements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settlement public.sunday_barber_settlements%rowtype;
  v_day public.sunday_sales_days%rowtype;
  v_actor uuid := public.current_employee_id();
begin
  select * into v_settlement from public.sunday_barber_settlements where id = p_settlement_id for update;
  if not found then raise exception 'El pago dominical no existe.'; end if;
  select * into v_day from public.sunday_sales_days where id = v_settlement.sunday_day_id for update;
  if not public.can_manage_sunday_sales_branch(v_day.branch_id) then raise exception 'No tienes permisos para pagar esta operación dominical.'; end if;
  if v_day.status <> 'open' or v_settlement.status <> 'draft' then
    raise exception 'Solo un pago pendiente de una jornada abierta puede registrarse.';
  end if;
  if not exists (
    select 1 from public.payment_methods
    where id = p_payment_method_id and is_active and payment_kind <> 'internal_credit'
  ) then
    raise exception 'Selecciona un método de pago activo.';
  end if;
  update public.sunday_barber_settlements
  set status = 'paid', paid_by = v_actor, paid_at = now(),
      payment_method_id = p_payment_method_id,
      payment_reference = nullif(btrim(coalesce(p_reference, '')), ''),
      notes = nullif(btrim(coalesce(p_notes, '')), '')
  where id = v_settlement.id
  returning * into v_settlement;
  return v_settlement;
end;
$$;

create or replace function public.close_sunday_sales_day(p_day_id uuid, p_notes text default null)
returns public.sunday_sales_days
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_day public.sunday_sales_days%rowtype;
  v_actor uuid := public.current_employee_id();
begin
  select * into v_day from public.sunday_sales_days where id = p_day_id for update;
  if not found or not public.can_manage_sunday_sales_branch(v_day.branch_id) then
    raise exception 'No tienes permisos para cerrar esta jornada.';
  end if;
  if v_day.status <> 'open' then raise exception 'La jornada ya está cerrada.'; end if;
  if exists (
    select 1 from public.sunday_barber_settlements
    where sunday_day_id = p_day_id and status = 'draft'
  ) then
    raise exception 'Registra todos los pagos a barberos antes de cerrar la jornada.';
  end if;
  if exists (
    select 1 from public.sunday_sales sale
    where sale.sunday_day_id = p_day_id and sale.status = 'completed'
      and not exists (
        select 1 from public.sunday_barber_settlements settlement
        where settlement.sunday_day_id = sale.sunday_day_id
          and settlement.employee_id = sale.barber_id
          and settlement.status = 'paid'
      )
  ) then
    raise exception 'Falta calcular o registrar el pago de uno o más barberos.';
  end if;
  update public.sunday_sales_days
  set status = 'closed', closing_notes = nullif(btrim(coalesce(p_notes, '')), ''),
      closed_by = v_actor, closed_at = now()
  where id = p_day_id
  returning * into v_day;
  return v_day;
end;
$$;

revoke all on function public.open_sunday_sales_day(uuid, date, numeric, text) from public, anon;
revoke all on function public.register_sunday_sale(uuid, uuid, uuid, jsonb, jsonb, text, text) from public, anon;
revoke all on function public.reverse_rewards_for_cancelled_sunday_sale(uuid) from public, anon;
revoke all on function public.cancel_sunday_sale(uuid, text) from public, anon;
revoke all on function public.set_sunday_barber_settlement_rate(uuid, numeric) from public, anon;
grant execute on function public.open_sunday_sales_day(uuid, date, numeric, text) to authenticated, service_role;
grant execute on function public.register_sunday_sale(uuid, uuid, uuid, jsonb, jsonb, text, text) to authenticated, service_role;
grant execute on function public.cancel_sunday_sale(uuid, text) to authenticated, service_role;
grant execute on function public.set_sunday_barber_settlement_rate(uuid, numeric) to authenticated, service_role;
grant execute on function public.reverse_rewards_for_cancelled_sunday_sale(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
