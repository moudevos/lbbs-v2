-- QA/STAGING ONLY. Run only after 001_reset_qa_business_data.sql.
do $$
declare v_environment text;
begin
  if to_regclass('public.system_environment') is null then raise exception 'QA seed blocked: system_environment is required.'; end if;
  select environment_name into v_environment from public.system_environment limit 1;
  if v_environment not in ('qa','staging') then raise exception 'QA seed blocked outside QA environment'; end if;
end $$;

-- This seed is intentionally idempotent and only creates QA_ fixtures. IDs
-- are resolved by name so no production or authentication identifier is used.
insert into public.product_categories(name,slug,business_line,is_active,sort_order)
values ('QA CERAS','qa-ceras','barbershop_products',true,900),('QA BEBIDAS','qa-bebidas','cafeteria_products',true,901)
on conflict (slug) do update set business_line=excluded.business_line,is_active=true;

-- Employee/customer/service creation is environment-specific because the
-- active schema has mandatory authentication and branch constraints. The QA
-- runner resolves the QA branch/admin and creates those fixtures through its
-- authenticated API path; no production identity is guessed in SQL.
