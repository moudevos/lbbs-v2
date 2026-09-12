-- Control diario de ventas POS. Usa accounting_date (fecha operativa Lima),
-- por lo que no depende de created_at ni de la zona horaria del navegador.

create or replace function public.get_sales_control_breakdown(
  p_accounting_date date,
  p_branch_id uuid default null,
  p_pos_session_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if p_accounting_date is null then
    raise exception 'La fecha operativa es obligatoria.';
  end if;

  if p_branch_id is not null and not public.can_manage_pos_branch(p_branch_id) then
    raise exception 'No tienes permisos para consultar esta sede.';
  end if;

  with scoped_sales as (
    select sale.*
    from public.sales sale
    where sale.status = 'completed'
      and sale.accounting_date = p_accounting_date
      and (p_branch_id is null or sale.branch_id = p_branch_id)
      and (p_pos_session_id is null or sale.pos_session_id = p_pos_session_id)
      and public.can_manage_pos_branch(sale.branch_id)
  ), reward_sales as (
    select distinct redemption.sale_id
    from public.reward_redemptions redemption
    join scoped_sales sale on sale.id = redemption.sale_id
    where redemption.status = 'applied'
  ), service_lines as (
    select
      sale.id as sale_id,
      coalesce(item.barber_id, sale.barber_id) as barber_id,
      greatest(coalesce(item.total, 0), 0) as collected_amount,
      case
        when item.is_courtesy or reward.sale_id is not null then 0::numeric
        when public.is_operational_contribution_service_excluded(item.service_id, coalesce(sale.closed_at, sale.created_at)) then 0::numeric
        when item.quantity <= 0 then 0::numeric
        else least(
          greatest(coalesce(item.total, 0), 0),
          round(item.quantity * public.calculate_operational_contribution(greatest(coalesce(item.total, 0), 0) / item.quantity, sale.accounting_date), 2)
        )
      end as contribution_amount
    from scoped_sales sale
    join public.sale_items item on item.sale_id = sale.id and item.item_type = 'service'
    left join reward_sales reward on reward.sale_id = sale.id
  ), payment_rows as (
    select
      sale.id as sale_id,
      sale.created_at,
      sale.total as sale_total,
      sale.customer_id,
      sale.barber_id,
      payment.amount,
      payment.change_amount,
      method.id as payment_method_id,
      method.name as payment_method_name,
      method.payment_kind
    from scoped_sales sale
    join public.sale_payments payment on payment.sale_id = sale.id
    join public.payment_methods method on method.id = payment.payment_method_id
  ), category_rows as (
    select
      case
        when item.item_type = 'service' then 'Servicios'
        else coalesce(product_category.name, 'Productos y otras categorías')
      end as category_name,
      item.item_type,
      sum(item.total) as total
    from scoped_sales sale
    join public.sale_items item on item.sale_id = sale.id
    left join public.products product on product.id = item.product_id
    left join public.product_categories product_category on product_category.id = product.category_id
    group by 1, 2
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'sales_count', (select count(*) from scoped_sales),
      'gross_total', coalesce((select sum(subtotal) from scoped_sales), 0),
      'net_total', coalesce((select sum(total) from scoped_sales), 0),
      'paid_total', coalesce((select sum(paid_total) from scoped_sales), 0),
      'service_total', coalesce((select sum(collected_amount) from service_lines), 0),
      'operational_contribution_total', coalesce((select sum(contribution_amount) from service_lines), 0),
      'commissionable_base_total', coalesce((select sum(collected_amount - contribution_amount) from service_lines), 0),
      'courtesy_total', coalesce((select sum(courtesy_total) from scoped_sales), 0),
      'discount_total', coalesce((select sum(discount_total) from scoped_sales), 0),
      'reward_discount_total', coalesce((select sum(redemption.discount_amount) from public.reward_redemptions redemption join scoped_sales sale on sale.id = redemption.sale_id where redemption.status = 'applied'), 0),
      'internal_credit_total', coalesce((select sum(amount) from payment_rows where payment_kind = 'internal_credit'), 0),
      'real_collected_total', coalesce((select sum(amount) from payment_rows where payment_kind <> 'internal_credit'), 0)
    ),
    'payments', coalesce((select jsonb_agg(jsonb_build_object(
      'sale_id', sale_id, 'created_at', created_at, 'sale_total', sale_total,
      'customer_name', coalesce((select full_name from public.customers where id = customer_id), 'Cliente varios'),
      'barber_name', coalesce((select full_name from public.employees where id = barber_id), 'Sin barbero'),
      'amount', amount, 'change_amount', change_amount,
      'payment_method_id', payment_method_id, 'payment_method_name', payment_method_name, 'payment_kind', payment_kind
    ) order by created_at desc) from payment_rows), '[]'::jsonb),
    'barbers', coalesce((select jsonb_agg(jsonb_build_object(
      'employee_id', barber_id,
      'employee_name', coalesce((select full_name from public.employees where id = barber_id), 'Sin barbero'),
      'services_count', services_count, 'service_gross', service_gross,
      'operational_contribution', operational_contribution, 'commissionable_base', commissionable_base
    ) order by commissionable_base desc, service_gross desc) from (
      select barber_id, count(*) as services_count, sum(collected_amount) as service_gross,
        sum(contribution_amount) as operational_contribution,
        sum(collected_amount - contribution_amount) as commissionable_base
      from service_lines where barber_id is not null group by barber_id
    ) ranking), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('name', category_name, 'item_type', item_type, 'total', total) order by total desc) from category_rows), '[]'::jsonb),
    'adjustments', jsonb_build_object(
      'courtesy_total', coalesce((select sum(courtesy_total) from scoped_sales), 0),
      'commercial_discount_total', coalesce((select sum(discount_total) from scoped_sales), 0),
      'reward_discount_total', coalesce((select sum(redemption.discount_amount) from public.reward_redemptions redemption join scoped_sales sale on sale.id = redemption.sale_id where redemption.status = 'applied'), 0),
      'internal_operations', coalesce((select count(*) from scoped_sales where operation_kind <> 'customer'), 0),
      'internal_credit_total', coalesce((select sum(amount) from payment_rows where payment_kind = 'internal_credit'), 0)
    ),
    'recent_sales', coalesce((select jsonb_agg(jsonb_build_object(
      'id', sale.id, 'created_at', sale.created_at, 'total', sale.total, 'paid_total', sale.paid_total,
      'courtesy_total', sale.courtesy_total, 'discount_total', sale.discount_total, 'operation_kind', sale.operation_kind,
      'customer_name', coalesce(customer.full_name, 'Cliente varios'), 'barber_name', coalesce(barber.full_name, 'Sin barbero'),
      'payment_methods', coalesce((select jsonb_agg(method.name order by method.name) from public.sale_payments payment join public.payment_methods method on method.id = payment.payment_method_id where payment.sale_id = sale.id), '[]'::jsonb)
    ) order by sale.created_at desc) from scoped_sales sale left join public.customers customer on customer.id = sale.customer_id left join public.employees barber on barber.id = sale.barber_id), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_sales_control_breakdown(date, uuid, uuid) from public, anon;
grant execute on function public.get_sales_control_breakdown(date, uuid, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
