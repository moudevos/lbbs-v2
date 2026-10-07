-- The sale trigger has always emitted courtesy_actual_cost. Align P&L with
-- that canonical posting code so historical and future sales are grouped
-- consistently without changing any posting rows.
create or replace function public.get_financial_analysis_v2(
  p_date_from date,
  p_date_to date,
  p_branch_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_services numeric := 0;
  v_barber numeric := 0;
  v_cafe numeric := 0;
  v_other numeric := 0;
  v_cogs numeric := 0;
  v_courtesy numeric := 0;
  v_personnel numeric := 0;
  v_expenses numeric := 0;
  v_income numeric := 0;
  v_profit numeric := 0;
begin
  if p_date_from is null or p_date_to is null or p_date_from > p_date_to then
    raise exception 'El rango de fechas no es valido.';
  end if;

  if not public.is_admin() then
    raise exception 'Solo owner o admin pueden ver Ganancias y Perdidas.';
  end if;

  select
    coalesce(sum(profit_signed_amount) filter (
      where financial_group = 'operating_income' and business_line = 'services'
    ), 0),
    coalesce(sum(profit_signed_amount) filter (
      where financial_group = 'operating_income' and business_line = 'barbershop_products'
    ), 0),
    coalesce(sum(profit_signed_amount) filter (
      where financial_group = 'operating_income' and business_line = 'cafeteria_products'
    ), 0),
    coalesce(sum(profit_signed_amount) filter (
      where financial_group = 'operating_income' and coalesce(business_line, 'other') = 'other'
    ), 0),
    coalesce(-sum(profit_signed_amount) filter (
      where financial_group = 'cost_of_sales' and posting_code <> 'courtesy_actual_cost'
    ), 0),
    coalesce(-sum(profit_signed_amount) filter (
      where financial_group = 'cost_of_sales' and posting_code = 'courtesy_actual_cost'
    ), 0),
    coalesce(-sum(profit_signed_amount) filter (
      where financial_group = 'personnel_cost'
    ), 0),
    coalesce(-sum(profit_signed_amount) filter (
      where financial_group = 'operating_expense'
    ), 0)
  into v_services, v_barber, v_cafe, v_other, v_cogs, v_courtesy,
       v_personnel, v_expenses
  from public.vw_financial_postings_signed
  where accounting_date between p_date_from and p_date_to
    and (p_branch_id is null or branch_id = p_branch_id)
    and affects_profit;

  v_income := round(v_services + v_barber + v_cafe + v_other, 2);
  v_profit := round(v_income - v_cogs - v_courtesy - v_personnel - v_expenses, 2);

  return jsonb_build_object(
    'period', jsonb_build_object('from', p_date_from, 'to', p_date_to, 'branchId', p_branch_id),
    'sales', jsonb_build_object(
      'serviceSales', v_services,
      'barbershopProductSales', v_barber,
      'cafeteriaProductSales', v_cafe,
      'otherCategorySales', v_other,
      'commercialRetailGross', v_income,
      'netCommercialSales', v_income
    ),
    'directCosts', jsonb_build_object(
      'productCogs', v_cogs,
      'courtesyProductRealCost', v_courtesy
    ),
    'personnel', jsonb_build_object(
      'recognizedPersonnelCost', v_personnel,
      'accruedCost', v_personnel
    ),
    'expenses', jsonb_build_object('operatingExpenses', v_expenses),
    'profit', jsonb_build_object(
      'operatingProfit', v_profit,
      'operatingMarginPercentage', case when v_income = 0 then null else round(v_profit / v_income * 100, 2) end,
      'status', 'final'
    )
  );
end;
$$;
