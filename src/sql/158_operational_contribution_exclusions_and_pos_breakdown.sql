-- Excluye servicios concretos del aporte operativo sin reescribir el pasado.
-- La ventana de vigencia se compara con el instante de cierre de la venta,
-- no con el instante posterior en que se regenera producción.

create table if not exists public.operational_contribution_service_exclusions (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete restrict,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from)
);

create unique index if not exists operational_contribution_service_exclusions_active_service_idx
  on public.operational_contribution_service_exclusions (service_id)
  where effective_to is null;

alter table public.operational_contribution_service_exclusions enable row level security;
drop policy if exists "operational_contribution_exclusions_admin" on public.operational_contribution_service_exclusions;
create policy "operational_contribution_exclusions_admin"
  on public.operational_contribution_service_exclusions
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.is_operational_contribution_service_excluded(
  p_service_id uuid,
  p_occurred_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_service_id is not null and exists (
    select 1
    from public.operational_contribution_service_exclusions exclusion
    where exclusion.service_id = p_service_id
      and exclusion.effective_from <= coalesce(p_occurred_at, now())
      and (exclusion.effective_to is null or exclusion.effective_to > coalesce(p_occurred_at, now()))
  );
$$;

-- El trigger se ejecuta al insertar o re-sincronizar producción nueva. La
-- condición usa sales.closed_at, por lo que una regeneración histórica sigue
-- respetando la configuración que existía en el instante de esa venta.
create or replace function public.apply_operational_contribution_service_exclusion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_occurred_at timestamptz;
begin
  if new.production_source not in ('normal', 'commercial_discount') then
    return new;
  end if;

  select coalesce(sale.closed_at, sale.created_at)
  into v_occurred_at
  from public.sales sale
  where sale.id = new.sale_id;

  if public.is_operational_contribution_service_excluded(new.service_id, v_occurred_at) then
    update public.employee_service_production
    set operational_contribution_amount = 0,
        commissionable_amount = greatest(coalesce(new.collected_amount, 0), 0),
        updated_at = now()
    where id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists employee_service_production_operational_exclusion on public.employee_service_production;
create trigger employee_service_production_operational_exclusion
after insert or update of sale_id, service_id, production_source on public.employee_service_production
for each row execute function public.apply_operational_contribution_service_exclusion();

-- Conciliación operativa de una sesión: ventas de servicios por separado,
-- aporte total, base comisionable y productos agrupados por categoría real.
create or replace function public.get_pos_session_operational_breakdown(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.pos_sessions%rowtype;
  v_service_gross numeric(12,2) := 0;
  v_service_net numeric(12,2) := 0;
  v_contribution numeric(12,2) := 0;
  v_base numeric(12,2) := 0;
  v_product_categories jsonb := '[]'::jsonb;
  v_has_production boolean := false;
begin
  select * into v_session from public.pos_sessions where id = p_session_id;
  if not found then raise exception 'La sesión POS no existe.'; end if;
  if not public.can_manage_pos_branch(v_session.branch_id) then
    raise exception 'No tienes permisos para ver esta sesión POS.';
  end if;

  select
    coalesce(sum(item.quantity * item.unit_price) filter (where item.item_type = 'service' and not item.is_courtesy), 0),
    coalesce(sum(item.total) filter (where item.item_type = 'service' and not item.is_courtesy), 0)
  into v_service_gross, v_service_net
  from public.sale_items item
  join public.sales sale on sale.id = item.sale_id
  where sale.pos_session_id = p_session_id
    and sale.status = 'completed';

  select exists (
    select 1
    from public.employee_service_production production
    join public.sales sale on sale.id = production.sale_id
    where sale.pos_session_id = p_session_id
      and production.status = 'active'
  ) into v_has_production;

  if v_has_production then
    select
      coalesce(sum(production.operational_contribution_amount), 0),
      coalesce(sum(production.commissionable_amount), 0)
    into v_contribution, v_base
    from public.employee_service_production production
    join public.sales sale on sale.id = production.sale_id
    where sale.pos_session_id = p_session_id
      and production.status = 'active';
  else
    select
      coalesce(sum(contribution.amount), 0),
      coalesce(sum(case
        when coalesce(item.barber_id, sale.barber_id) is null then 0
        when item.is_courtesy or reward.sale_id is not null then 0
        else greatest(item.total - contribution.amount, 0)
      end), 0)
    into v_contribution, v_base
    from public.sale_items item
    join public.sales sale on sale.id = item.sale_id
    left join lateral (
      select redemption.sale_id
      from public.reward_redemptions redemption
      where redemption.sale_id = sale.id and redemption.status = 'applied'
      limit 1
    ) reward on true
    cross join lateral (
      select case
        when item.item_type <> 'service' or item.is_courtesy or reward.sale_id is not null then 0::numeric
        when public.is_operational_contribution_service_excluded(item.service_id, coalesce(sale.closed_at, sale.created_at)) then 0::numeric
        when item.quantity <= 0 then 0::numeric
        else least(
          greatest(item.total, 0),
          round(item.quantity * public.calculate_operational_contribution(greatest(item.total, 0) / item.quantity, sale.accounting_date), 2)
        )
      end as amount
    ) contribution
    where sale.pos_session_id = p_session_id
      and sale.status = 'completed'
      and item.item_type = 'service';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'category_name', grouped.category_name,
    'gross_total', grouped.gross_total,
    'net_total', grouped.net_total
  ) order by grouped.category_name), '[]'::jsonb)
  into v_product_categories
  from (
    select
      coalesce(category.name, 'Sin categoría') as category_name,
      round(sum(item.quantity * item.unit_price), 2) as gross_total,
      round(sum(item.total), 2) as net_total
    from public.sale_items item
    join public.sales sale on sale.id = item.sale_id
    left join public.products product on product.id = item.product_id
    left join public.product_categories category on category.id = product.category_id
    where sale.pos_session_id = p_session_id
      and sale.status = 'completed'
      and item.item_type = 'product'
      and not item.is_courtesy
    group by coalesce(category.name, 'Sin categoría')
  ) grouped;

  return jsonb_build_object(
    'service_gross_total', round(v_service_gross, 2),
    'service_net_total', round(v_service_net, 2),
    'operational_contribution_total', round(v_contribution, 2),
    'commissionable_base_total', round(v_base, 2),
    'product_categories', v_product_categories,
    'is_estimated', not v_has_production
  );
end;
$$;

-- Se mantiene el filtro de crédito interno de la versión previa y se añade la
-- lectura operativa como dato de detalle, sin tocar totales de caja.
create or replace function public.get_pos_session_closure_summary(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_summary jsonb;
  v_payments jsonb;
begin
  v_summary := public.get_pos_session_closure_summary_raw(p_session_id);

  if not public.is_admin() and exists (
    select 1 from public.pos_session_legacy_closure_authorizations
    where pos_session_id = p_session_id
  ) then
    raise exception 'No tienes permisos para ver el cierre histórico auditado.';
  end if;

  select coalesce(jsonb_agg(item order by ordinal), '[]'::jsonb)
  into v_payments
  from jsonb_array_elements(v_summary -> 'payment_methods') with ordinality as payments(item, ordinal)
  join public.payment_methods method
    on method.id = (item ->> 'payment_method_id')::uuid
  where method.payment_kind <> 'internal_credit';

  v_summary := jsonb_set(v_summary, '{payment_methods}', v_payments, true);
  return jsonb_set(
    v_summary,
    '{operational_breakdown}',
    public.get_pos_session_operational_breakdown(p_session_id),
    true
  );
end;
$$;

revoke all on table public.operational_contribution_service_exclusions from public, anon;
grant select, insert, update on table public.operational_contribution_service_exclusions to authenticated;
revoke all on function public.is_operational_contribution_service_excluded(uuid, timestamptz) from public;
revoke all on function public.apply_operational_contribution_service_exclusion() from public;
revoke all on function public.get_pos_session_operational_breakdown(uuid) from public;
grant execute on function public.is_operational_contribution_service_excluded(uuid, timestamptz) to service_role;
grant execute on function public.get_pos_session_operational_breakdown(uuid) to authenticated, service_role;
revoke all on function public.get_pos_session_closure_summary(uuid) from public;
grant execute on function public.get_pos_session_closure_summary(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
