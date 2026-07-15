-- Sprint 8.13: reglas auditables para cortesias operativas.
create table if not exists public.courtesy_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  branch_id uuid references public.branches(id) on delete cascade,
  is_active boolean not null default true,
  priority integer not null default 0,
  qualifying_item_type text not null default 'service' check (qualifying_item_type = 'service'),
  qualifying_service_id uuid references public.services(id) on delete restrict,
  qualifying_service_category_id uuid references public.service_categories(id) on delete restrict,
  minimum_unit_amount numeric(12,2) not null default 0 check (minimum_unit_amount >= 0),
  amount_basis text not null default 'effective_unit_price' check (amount_basis in ('effective_unit_price', 'catalog_unit_price')),
  maximum_courtesy_items integer not null default 1 check (maximum_courtesy_items > 0),
  maximum_courtesy_amount numeric(12,2) check (maximum_courtesy_amount is null or maximum_courtesy_amount >= 0),
  allow_with_reward boolean not null default false,
  reward_covered_service_qualifies boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.employees(id) on delete set null,
  updated_by uuid references public.employees(id) on delete set null,
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check (qualifying_service_id is null or qualifying_service_category_id is null)
);

create table if not exists public.courtesy_rule_benefits (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.courtesy_rules(id) on delete cascade,
  benefit_item_type text not null check (benefit_item_type in ('service', 'product')),
  service_id uuid references public.services(id) on delete restrict,
  product_id uuid references public.products(id) on delete restrict,
  service_category_id uuid references public.service_categories(id) on delete restrict,
  product_category_id uuid references public.product_categories(id) on delete restrict,
  max_quantity integer not null default 1 check (max_quantity > 0),
  max_unit_amount numeric(12,2) check (max_unit_amount is null or max_unit_amount >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(service_id, product_id, service_category_id, product_category_id) = 1)
);

alter table public.sale_items
  add column if not exists courtesy_rule_id uuid references public.courtesy_rules(id) on delete set null,
  add column if not exists courtesy_rule_name_snapshot text,
  add column if not exists original_unit_price numeric(12,2),
  add column if not exists original_total numeric(12,2),
  add column if not exists courtesy_amount numeric(12,2),
  add column if not exists qualifying_sale_item_id uuid references public.sale_items(id) on delete set null,
  add column if not exists courtesy_authorized_by uuid references public.employees(id) on delete set null;

create index if not exists courtesy_rules_scope_idx on public.courtesy_rules (branch_id, is_active, priority desc);
create index if not exists courtesy_rule_benefits_rule_idx on public.courtesy_rule_benefits (rule_id, is_active);

alter table public.courtesy_rules enable row level security;
alter table public.courtesy_rule_benefits enable row level security;

drop policy if exists "courtesy_rules_select" on public.courtesy_rules;
drop policy if exists "courtesy_rules_manage" on public.courtesy_rules;
drop policy if exists "courtesy_rule_benefits_select" on public.courtesy_rule_benefits;
drop policy if exists "courtesy_rule_benefits_manage" on public.courtesy_rule_benefits;

create policy "courtesy_rules_select" on public.courtesy_rules for select to authenticated using (public.is_admin() or public.is_owner() or branch_id is null or public.can_access_branch(branch_id));
create policy "courtesy_rules_manage" on public.courtesy_rules for all to authenticated using (public.is_admin() or public.is_owner()) with check (public.is_admin() or public.is_owner());
create policy "courtesy_rule_benefits_select" on public.courtesy_rule_benefits for select to authenticated using (exists (select 1 from public.courtesy_rules rule where rule.id = courtesy_rule_benefits.rule_id and (public.is_admin() or public.is_owner() or rule.branch_id is null or public.can_access_branch(rule.branch_id))));
create policy "courtesy_rule_benefits_manage" on public.courtesy_rule_benefits for all to authenticated using (public.is_admin() or public.is_owner()) with check (public.is_admin() or public.is_owner());

grant select on public.courtesy_rules, public.courtesy_rule_benefits to authenticated;
grant insert, update on public.courtesy_rules, public.courtesy_rule_benefits to authenticated;
grant all on public.courtesy_rules, public.courtesy_rule_benefits to service_role;
revoke all on public.courtesy_rules, public.courtesy_rule_benefits from anon, public;
notify pgrst, 'reload schema';
