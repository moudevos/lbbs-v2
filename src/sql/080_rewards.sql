create table if not exists public.reward_benefits (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  benefit_type text not null,
  service_id uuid references public.services(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  voucher_amount numeric(12,2),
  discount_percent numeric(5,2),
  applies_to text not null default 'all',
  max_discount_amount numeric(12,2),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reward_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  metric_type text not null,
  threshold_value numeric(12,2) not null,
  benefit_id uuid references public.reward_benefits(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  applies_to text not null default 'global',
  starts_at timestamptz,
  ends_at timestamptz,
  expires_days integer,
  is_repeatable boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reward_rules
  add column if not exists service_id uuid references public.services(id) on delete set null;

create table if not exists public.customer_reward_ledger (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  sale_id uuid references public.sales(id) on delete set null,
  rule_id uuid references public.reward_rules(id) on delete set null,
  movement_type text not null,
  metric_type text not null,
  quantity numeric(12,2) not null default 0,
  amount numeric(12,2) not null default 0,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_reward_entitlements (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  rule_id uuid references public.reward_rules(id) on delete set null,
  benefit_id uuid not null references public.reward_benefits(id) on delete restrict,
  source_ledger_id uuid references public.customer_reward_ledger(id) on delete set null,
  status text not null default 'available',
  earned_at timestamptz not null default now(),
  expires_at timestamptz,
  redeemed_at timestamptz,
  redeemed_sale_id uuid references public.sales(id) on delete set null,
  cancelled_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  entitlement_id uuid not null references public.customer_reward_entitlements(id) on delete restrict,
  sale_id uuid not null references public.sales(id) on delete restrict,
  benefit_id uuid not null references public.reward_benefits(id) on delete restrict,
  discount_amount numeric(12,2) not null default 0,
  status text not null default 'applied',
  applied_by uuid references public.employees(id) on delete set null,
  applied_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancellation_reason text,
  metadata jsonb not null default '{}'::jsonb
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'reward_rules_metric_type_check'
      and conrelid = 'public.reward_rules'::regclass
  ) then
    alter table public.reward_rules
      add constraint reward_rules_metric_type_check
      check (
        metric_type in (
          'service_visit_count',
          'sale_count',
          'product_purchase_count',
          'amount_spent',
          'specific_service_count'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'reward_rules_applies_to_check'
      and conrelid = 'public.reward_rules'::regclass
  ) then
    alter table public.reward_rules
      add constraint reward_rules_applies_to_check
      check (
        applies_to in (
          'global',
          'products_only',
          'services_only',
          'specific_service',
          'specific_product'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'reward_rules_threshold_check'
      and conrelid = 'public.reward_rules'::regclass
  ) then
    alter table public.reward_rules
      add constraint reward_rules_threshold_check
      check (threshold_value > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'reward_rules_expires_days_check'
      and conrelid = 'public.reward_rules'::regclass
  ) then
    alter table public.reward_rules
      add constraint reward_rules_expires_days_check
      check (expires_days is null or expires_days >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'reward_rules_specific_service_check'
      and conrelid = 'public.reward_rules'::regclass
  ) then
    alter table public.reward_rules
      add constraint reward_rules_specific_service_check
      check (
        (
          metric_type <> 'specific_service_count'
          and applies_to <> 'specific_service'
        )
        or service_id is not null
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'reward_benefits_type_check'
      and conrelid = 'public.reward_benefits'::regclass
  ) then
    alter table public.reward_benefits
      add constraint reward_benefits_type_check
      check (
        benefit_type in (
          'free_service',
          'voucher_amount',
          'product_discount_percent'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'reward_benefits_applies_to_check'
      and conrelid = 'public.reward_benefits'::regclass
  ) then
    alter table public.reward_benefits
      add constraint reward_benefits_applies_to_check
      check (
        applies_to in (
          'all',
          'products_only',
          'services_only',
          'specific_service',
          'specific_product'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'reward_benefits_amounts_check'
      and conrelid = 'public.reward_benefits'::regclass
  ) then
    alter table public.reward_benefits
      add constraint reward_benefits_amounts_check
      check (
        (voucher_amount is null or voucher_amount >= 0)
        and (discount_percent is null or (discount_percent > 0 and discount_percent <= 100))
        and (max_discount_amount is null or max_discount_amount >= 0)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'reward_benefits_logic_check'
      and conrelid = 'public.reward_benefits'::regclass
  ) then
    alter table public.reward_benefits
      add constraint reward_benefits_logic_check
      check (
        (benefit_type = 'free_service' and service_id is not null)
        or (benefit_type = 'voucher_amount' and voucher_amount is not null and voucher_amount > 0)
        or (
          benefit_type = 'product_discount_percent'
          and discount_percent is not null
          and discount_percent > 0
          and discount_percent <= 100
          and applies_to in ('products_only', 'specific_product')
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'customer_reward_ledger_movement_type_check'
      and conrelid = 'public.customer_reward_ledger'::regclass
  ) then
    alter table public.customer_reward_ledger
      add constraint customer_reward_ledger_movement_type_check
      check (
        movement_type in (
          'accrual',
          'reversal',
          'manual_migration',
          'manual_adjustment'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'customer_reward_ledger_metric_type_check'
      and conrelid = 'public.customer_reward_ledger'::regclass
  ) then
    alter table public.customer_reward_ledger
      add constraint customer_reward_ledger_metric_type_check
      check (
        metric_type in (
          'service_visit_count',
          'sale_count',
          'product_purchase_count',
          'amount_spent',
          'specific_service_count'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'customer_reward_entitlements_status_check'
      and conrelid = 'public.customer_reward_entitlements'::regclass
  ) then
    alter table public.customer_reward_entitlements
      add constraint customer_reward_entitlements_status_check
      check (status in ('available', 'redeemed', 'expired', 'cancelled'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'reward_redemptions_status_check'
      and conrelid = 'public.reward_redemptions'::regclass
  ) then
    alter table public.reward_redemptions
      add constraint reward_redemptions_status_check
      check (status in ('applied', 'cancelled'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'reward_redemptions_discount_amount_check'
      and conrelid = 'public.reward_redemptions'::regclass
  ) then
    alter table public.reward_redemptions
      add constraint reward_redemptions_discount_amount_check
      check (discount_amount >= 0);
  end if;
end $$;

create index if not exists customer_reward_ledger_customer_created_at_desc_idx
  on public.customer_reward_ledger (customer_id, created_at desc);
create index if not exists customer_reward_ledger_sale_id_idx
  on public.customer_reward_ledger (sale_id);
create index if not exists customer_reward_entitlements_customer_status_idx
  on public.customer_reward_entitlements (customer_id, status);
create index if not exists customer_reward_entitlements_expires_at_idx
  on public.customer_reward_entitlements (expires_at);
create index if not exists reward_redemptions_customer_id_idx
  on public.reward_redemptions (customer_id);
create index if not exists reward_redemptions_sale_id_idx
  on public.reward_redemptions (sale_id);
create unique index if not exists reward_redemptions_one_applied_per_sale_idx
  on public.reward_redemptions (sale_id)
  where status = 'applied';
create index if not exists reward_rules_is_active_idx
  on public.reward_rules (is_active);
create index if not exists reward_benefits_is_active_idx
  on public.reward_benefits (is_active);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public;
grant execute on function public.set_updated_at() to authenticated, service_role;

drop trigger if exists reward_rules_set_updated_at on public.reward_rules;
create trigger reward_rules_set_updated_at
before update on public.reward_rules
for each row execute function public.set_updated_at();

drop trigger if exists reward_benefits_set_updated_at on public.reward_benefits;
create trigger reward_benefits_set_updated_at
before update on public.reward_benefits
for each row execute function public.set_updated_at();

drop trigger if exists customer_reward_entitlements_set_updated_at on public.customer_reward_entitlements;
create trigger customer_reward_entitlements_set_updated_at
before update on public.customer_reward_entitlements
for each row execute function public.set_updated_at();

create or replace function public.mark_expired_reward_entitlements(
  p_customer_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
begin
  update public.customer_reward_entitlements
  set status = 'expired',
      updated_at = now()
  where status = 'available'
    and expires_at is not null
    and expires_at < now()
    and (p_customer_id is null or customer_id = p_customer_id);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.is_rewards_customer_eligible(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.customers c
    where c.id = p_customer_id
      and coalesce(c.phone_normalized, '') <> '000000000'
      and lower(coalesce(c.full_name, '')) <> 'cliente varios'
  )
$$;

drop function if exists public.get_reward_metric_total(uuid, text);

create or replace function public.get_reward_metric_total(
  p_customer_id uuid,
  p_metric_type text,
  p_service_id uuid default null
)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    sum(
      case
        when p_metric_type = 'amount_spent' then amount
        else quantity
      end
    ),
    0
  )
  from public.customer_reward_ledger
  where customer_id = p_customer_id
    and metric_type = p_metric_type
    and (
      p_metric_type <> 'specific_service_count'
      or (
        p_service_id is not null
        and coalesce(metadata ->> 'service_id', '') = p_service_id::text
      )
    )
$$;

create or replace function public.recalculate_customer_rewards(p_customer_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rule public.reward_rules%rowtype;
  v_total numeric(12,2);
  v_should_have integer := 0;
  v_existing_count integer := 0;
  v_missing_count integer := 0;
  v_created integer := 0;
  v_expires_at timestamptz;
  v_source_ledger_id uuid;
begin
  if not public.is_rewards_customer_eligible(p_customer_id) then
    return 0;
  end if;

  perform public.mark_expired_reward_entitlements(p_customer_id);

  for v_rule in
    select rr.*
    from public.reward_rules rr
    join public.reward_benefits rb on rb.id = rr.benefit_id
    where rr.is_active = true
      and rr.benefit_id is not null
      and rb.is_active = true
      and (rr.starts_at is null or rr.starts_at <= now())
      and (rr.ends_at is null or rr.ends_at >= now())
      and (
        rr.metric_type <> 'specific_service_count'
        or rr.service_id is not null
      )
  loop
    v_total := public.get_reward_metric_total(
      p_customer_id,
      v_rule.metric_type,
      v_rule.service_id
    );

    if v_rule.is_repeatable then
      v_should_have := floor(v_total / v_rule.threshold_value);
    else
      v_should_have := case when v_total >= v_rule.threshold_value then 1 else 0 end;
    end if;

    select count(*)
    into v_existing_count
    from public.customer_reward_entitlements cre
    where cre.customer_id = p_customer_id
      and cre.rule_id = v_rule.id
      and cre.status <> 'cancelled';

    v_missing_count := greatest(v_should_have - v_existing_count, 0);

    if v_missing_count <= 0 then
      continue;
    end if;

    select l.id
    into v_source_ledger_id
    from public.customer_reward_ledger l
    where l.customer_id = p_customer_id
      and l.metric_type = v_rule.metric_type
      and (
        v_rule.metric_type <> 'specific_service_count'
        or coalesce(l.metadata ->> 'service_id', '') = v_rule.service_id::text
      )
    order by l.created_at desc, l.id desc
    limit 1;

    for i in 1..v_missing_count loop
      v_expires_at := case
        when v_rule.expires_days is null then null
        else now() + make_interval(days => v_rule.expires_days)
      end;

      insert into public.customer_reward_entitlements (
        customer_id,
        rule_id,
        benefit_id,
        source_ledger_id,
        status,
        earned_at,
        expires_at,
        notes
      )
      values (
        p_customer_id,
        v_rule.id,
        v_rule.benefit_id,
        v_source_ledger_id,
        'available',
        now(),
        v_expires_at,
        'Reward recalculado automaticamente.'
      );

      v_created := v_created + 1;
    end loop;
  end loop;

  return v_created;
end;
$$;

create or replace function public.issue_reward_entitlements_for_metric(
  p_customer_id uuid,
  p_metric_type text,
  p_delta_value numeric,
  p_source_ledger_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rule public.reward_rules%rowtype;
  v_total numeric(12,2);
  v_previous_total numeric(12,2);
  v_earned_count integer;
  v_created integer := 0;
  v_expires_at timestamptz;
begin
  if coalesce(p_delta_value, 0) <= 0 then
    return 0;
  end if;

  if not public.is_rewards_customer_eligible(p_customer_id) then
    return 0;
  end if;

  perform public.mark_expired_reward_entitlements(p_customer_id);

  v_total := public.get_reward_metric_total(p_customer_id, p_metric_type, null);
  v_previous_total := greatest(v_total - p_delta_value, 0);

  for v_rule in
    select rr.*
    from public.reward_rules rr
    join public.reward_benefits rb on rb.id = rr.benefit_id
    where rr.metric_type = p_metric_type
      and rr.is_active = true
      and rb.is_active = true
      and (rr.starts_at is null or rr.starts_at <= now())
      and (rr.ends_at is null or rr.ends_at >= now())
  loop
    if v_rule.is_repeatable then
      v_earned_count :=
        floor(v_total / v_rule.threshold_value)
        - floor(v_previous_total / v_rule.threshold_value);
    else
      if exists (
        select 1
        from public.customer_reward_entitlements cre
        where cre.customer_id = p_customer_id
          and cre.rule_id = v_rule.id
      ) then
        v_earned_count := 0;
      elsif v_previous_total < v_rule.threshold_value and v_total >= v_rule.threshold_value then
        v_earned_count := 1;
      else
        v_earned_count := 0;
      end if;
    end if;

    if v_earned_count <= 0 then
      continue;
    end if;

    for i in 1..v_earned_count loop
      v_expires_at := case
        when v_rule.expires_days is null then null
        else now() + make_interval(days => v_rule.expires_days)
      end;

      insert into public.customer_reward_entitlements (
        customer_id,
        rule_id,
        benefit_id,
        source_ledger_id,
        status,
        earned_at,
        expires_at,
        notes
      )
      values (
        p_customer_id,
        v_rule.id,
        v_rule.benefit_id,
        p_source_ledger_id,
        'available',
        now(),
        v_expires_at,
        'Reward generado automaticamente.'
      );

      v_created := v_created + 1;
    end loop;
  end loop;

  return v_created;
end;
$$;

create or replace function public.process_rewards_for_completed_sale(p_sale_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale public.sales%rowtype;
  v_employee_id uuid := public.current_employee_id();
  v_service_count integer := 0;
  v_product_count integer := 0;
  v_ledger_id uuid;
  v_created integer := 0;
  v_service_row record;
begin
  select *
  into v_sale
  from public.sales
  where id = p_sale_id;

  if not found or v_sale.status <> 'completed' then
    return 0;
  end if;

  if not public.is_rewards_customer_eligible(v_sale.customer_id) then
    return 0;
  end if;

  select count(*)
  into v_service_count
  from public.sale_items
  where sale_id = p_sale_id
    and item_type = 'service';

  select count(*)
  into v_product_count
  from public.sale_items
  where sale_id = p_sale_id
    and item_type = 'product';

  if v_service_count > 0 and not exists (
    select 1
    from public.customer_reward_ledger
    where sale_id = p_sale_id
      and movement_type = 'accrual'
      and metric_type = 'service_visit_count'
  ) then
    insert into public.customer_reward_ledger (
      customer_id,
      sale_id,
      movement_type,
      metric_type,
      quantity,
      amount,
      description,
      metadata,
      created_by
    )
    values (
      v_sale.customer_id,
      p_sale_id,
      'accrual',
      'service_visit_count',
      1,
      0,
      'Acumulacion por atencion con servicio.',
      jsonb_build_object('service_count', v_service_count),
      v_employee_id
    )
    returning id into v_ledger_id;

  end if;

  for v_service_row in
    select
      si.service_id,
      sum(si.quantity) as total_quantity
    from public.sale_items si
    where si.sale_id = p_sale_id
      and si.item_type = 'service'
      and si.service_id is not null
    group by si.service_id
  loop
    if exists (
      select 1
      from public.customer_reward_ledger
      where sale_id = p_sale_id
        and movement_type = 'accrual'
        and metric_type = 'specific_service_count'
        and coalesce(metadata ->> 'service_id', '') = v_service_row.service_id::text
    ) then
      continue;
    end if;

    insert into public.customer_reward_ledger (
      customer_id,
      sale_id,
      movement_type,
      metric_type,
      quantity,
      amount,
      description,
      metadata,
      created_by
    )
    values (
      v_sale.customer_id,
      p_sale_id,
      'accrual',
      'specific_service_count',
      coalesce(v_service_row.total_quantity, 0),
      0,
      'Acumulacion por atenciones de un servicio especifico.',
      jsonb_build_object('service_id', v_service_row.service_id),
      v_employee_id
    );
  end loop;

  if not exists (
    select 1
    from public.customer_reward_ledger
    where sale_id = p_sale_id
      and movement_type = 'accrual'
      and metric_type = 'sale_count'
  ) then
    insert into public.customer_reward_ledger (
      customer_id,
      sale_id,
      movement_type,
      metric_type,
      quantity,
      amount,
      description,
      metadata,
      created_by
    )
    values (
      v_sale.customer_id,
      p_sale_id,
      'accrual',
      'sale_count',
      1,
      0,
      'Acumulacion por venta completada.',
      jsonb_build_object('has_services', v_service_count > 0, 'has_products', v_product_count > 0),
      v_employee_id
    )
    returning id into v_ledger_id;

  end if;

  if v_product_count > 0 and not exists (
    select 1
    from public.customer_reward_ledger
    where sale_id = p_sale_id
      and movement_type = 'accrual'
      and metric_type = 'product_purchase_count'
  ) then
    insert into public.customer_reward_ledger (
      customer_id,
      sale_id,
      movement_type,
      metric_type,
      quantity,
      amount,
      description,
      metadata,
      created_by
    )
    values (
      v_sale.customer_id,
      p_sale_id,
      'accrual',
      'product_purchase_count',
      1,
      0,
      'Acumulacion por compra con productos.',
      jsonb_build_object('product_count', v_product_count),
      v_employee_id
    )
    returning id into v_ledger_id;

  end if;

  if coalesce(v_sale.total, 0) > 0 and not exists (
    select 1
    from public.customer_reward_ledger
    where sale_id = p_sale_id
      and movement_type = 'accrual'
      and metric_type = 'amount_spent'
  ) then
    insert into public.customer_reward_ledger (
      customer_id,
      sale_id,
      movement_type,
      metric_type,
      quantity,
      amount,
      description,
      metadata,
      created_by
    )
    values (
      v_sale.customer_id,
      p_sale_id,
      'accrual',
      'amount_spent',
      0,
      v_sale.total,
      'Acumulacion por monto gastado.',
      jsonb_build_object('sale_total', v_sale.total),
      v_employee_id
    )
    returning id into v_ledger_id;

  end if;

  v_created := v_created + public.recalculate_customer_rewards(v_sale.customer_id);

  return v_created;
end;
$$;

create or replace function public.reverse_rewards_for_cancelled_sale(p_sale_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale public.sales%rowtype;
  v_employee_id uuid := public.current_employee_id();
  v_row record;
  v_count integer := 0;
begin
  select *
  into v_sale
  from public.sales
  where id = p_sale_id;

  if not found then
    return 0;
  end if;

  for v_row in
    select *
    from public.customer_reward_ledger
    where sale_id = p_sale_id
      and movement_type = 'accrual'
  loop
    if not exists (
      select 1
      from public.customer_reward_ledger rl
      where rl.sale_id = p_sale_id
        and rl.movement_type = 'reversal'
        and rl.metric_type = v_row.metric_type
        and rl.metadata ->> 'reverses_ledger_id' = v_row.id::text
    ) then
      insert into public.customer_reward_ledger (
        customer_id,
        sale_id,
        rule_id,
        movement_type,
        metric_type,
        quantity,
        amount,
        description,
        metadata,
        created_by
      )
      values (
        v_row.customer_id,
        p_sale_id,
        v_row.rule_id,
        'reversal',
        v_row.metric_type,
        -1 * coalesce(v_row.quantity, 0),
        -1 * coalesce(v_row.amount, 0),
        'Reversion por anulacion de venta.',
        jsonb_build_object('reverses_ledger_id', v_row.id),
        v_employee_id
      );

      v_count := v_count + 1;
    end if;
  end loop;

  update public.customer_reward_entitlements
  set status = 'cancelled',
      cancelled_at = now(),
      notes = coalesce(notes, '') || case when notes is null then '' else ' ' end || 'Cancelado por anulacion de venta.',
      updated_at = now()
  where source_ledger_id in (
      select id
      from public.customer_reward_ledger
      where sale_id = p_sale_id
        and movement_type = 'accrual'
    )
    and status = 'available';

  update public.reward_redemptions
  set status = 'cancelled',
      cancelled_at = now(),
      cancellation_reason = 'Venta anulada'
  where sale_id = p_sale_id
    and status = 'applied';

  update public.customer_reward_entitlements
  set status = case
        when expires_at is not null and expires_at < now() then 'expired'
        else 'available'
      end,
      redeemed_at = null,
      redeemed_sale_id = null,
      updated_at = now()
  where id in (
      select entitlement_id
      from public.reward_redemptions
      where sale_id = p_sale_id
    )
    and status = 'redeemed';

  return v_count;
end;
$$;

create or replace function public.apply_reward_to_sale(
  p_sale_id uuid,
  p_entitlement_id uuid
)
returns public.sales
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale public.sales%rowtype;
  v_entitlement public.customer_reward_entitlements%rowtype;
  v_benefit public.reward_benefits%rowtype;
  v_discount_remaining numeric(12,2) := 0;
  v_discount_total numeric(12,2) := 0;
  v_item record;
  v_item_total numeric(12,2);
  v_available numeric(12,2);
  v_extra numeric(12,2);
  v_has_eligible boolean := false;
  v_employee_id uuid := public.current_employee_id();
begin
  perform public.mark_expired_reward_entitlements(null);

  select *
  into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'La venta no existe.';
  end if;

  if v_sale.status <> 'draft' then
    raise exception 'Solo se puede aplicar rewards a una venta en borrador.';
  end if;

  if not public.is_rewards_customer_eligible(v_sale.customer_id) then
    raise exception 'Cliente varios no puede usar rewards.';
  end if;

  if exists (
    select 1
    from public.reward_redemptions rr
    where rr.sale_id = p_sale_id
      and rr.status = 'applied'
  ) then
    raise exception 'La venta ya tiene un reward aplicado.';
  end if;

  select *
  into v_entitlement
  from public.customer_reward_entitlements
  where id = p_entitlement_id
  for update;

  if not found then
    raise exception 'El reward seleccionado no existe.';
  end if;

  if v_entitlement.customer_id <> v_sale.customer_id then
    raise exception 'El reward no pertenece al cliente seleccionado.';
  end if;

  if v_entitlement.status <> 'available' then
    raise exception 'El reward ya no esta disponible.';
  end if;

  if v_entitlement.expires_at is not null and v_entitlement.expires_at < now() then
    update public.customer_reward_entitlements
    set status = 'expired',
        updated_at = now()
    where id = v_entitlement.id;

    raise exception 'El reward seleccionado ya vencio.';
  end if;

  select *
  into v_benefit
  from public.reward_benefits
  where id = v_entitlement.benefit_id;

  if not found or not v_benefit.is_active then
    raise exception 'El beneficio asociado ya no esta disponible.';
  end if;

  if v_benefit.benefit_type = 'voucher_amount' then
    v_discount_remaining := coalesce(v_benefit.voucher_amount, 0);
  elsif v_benefit.benefit_type = 'free_service' then
    v_discount_remaining := 999999;
  else
    v_discount_remaining := coalesce(v_benefit.max_discount_amount, 999999);
  end if;

  for v_item in
    select *
    from public.sale_items si
    where si.sale_id = p_sale_id
      and si.is_courtesy = false
    order by si.created_at, si.id
  loop
    if v_benefit.benefit_type = 'free_service' then
      if v_item.item_type <> 'service' or v_item.service_id is distinct from v_benefit.service_id then
        continue;
      end if;
    elsif v_benefit.benefit_type = 'product_discount_percent' then
      if v_item.item_type <> 'product' then
        continue;
      end if;

      if v_benefit.applies_to = 'specific_product'
         and v_item.product_id is distinct from v_benefit.product_id then
        continue;
      end if;
    else
      if v_benefit.applies_to = 'products_only' and v_item.item_type <> 'product' then
        continue;
      end if;

      if v_benefit.applies_to = 'services_only' and v_item.item_type <> 'service' then
        continue;
      end if;

      if v_benefit.applies_to = 'specific_service'
         and v_item.service_id is distinct from v_benefit.service_id then
        continue;
      end if;

      if v_benefit.applies_to = 'specific_product'
         and v_item.product_id is distinct from v_benefit.product_id then
        continue;
      end if;
    end if;

    v_has_eligible := true;
    v_item_total := round(v_item.quantity * v_item.unit_price, 2);
    v_available := greatest(v_item_total - coalesce(v_item.discount_amount, 0), 0);

    if v_available <= 0 then
      continue;
    end if;

    if v_benefit.benefit_type = 'free_service' then
      v_extra := least(v_item.unit_price, v_available, v_discount_remaining);
    elsif v_benefit.benefit_type = 'voucher_amount' then
      v_extra := least(v_available, v_discount_remaining);
    else
      v_extra := least(
        round(v_item_total * coalesce(v_benefit.discount_percent, 0) / 100.0, 2),
        v_available,
        v_discount_remaining
      );
    end if;

    if v_extra <= 0 then
      continue;
    end if;

    update public.sale_items
    set discount_amount = coalesce(discount_amount, 0) + v_extra,
        total = greatest((quantity * unit_price) - (coalesce(discount_amount, 0) + v_extra), 0)
    where id = v_item.id;

    v_discount_total := v_discount_total + v_extra;
    v_discount_remaining := greatest(v_discount_remaining - v_extra, 0);

    if v_benefit.benefit_type in ('free_service', 'voucher_amount') and v_discount_remaining <= 0 then
      exit;
    end if;
  end loop;

  if not v_has_eligible or v_discount_total <= 0 then
    raise exception 'Este reward no aplica a los items actuales de la venta.';
  end if;

  v_sale := public.recalculate_sale_totals(p_sale_id);

  insert into public.reward_redemptions (
    customer_id,
    entitlement_id,
    sale_id,
    benefit_id,
    discount_amount,
    status,
    applied_by,
    metadata
  )
  values (
    v_sale.customer_id,
    v_entitlement.id,
    v_sale.id,
    v_benefit.id,
    v_discount_total,
    'applied',
    v_employee_id,
    jsonb_build_object(
      'benefit_type', v_benefit.benefit_type,
      'applies_to', v_benefit.applies_to
    )
  );

  update public.customer_reward_entitlements
  set status = 'redeemed',
      redeemed_at = now(),
      redeemed_sale_id = v_sale.id,
      updated_at = now()
  where id = v_entitlement.id;

  return v_sale;
end;
$$;

drop function if exists public.register_reward_card_migration(uuid, numeric, text);

create or replace function public.register_reward_card_migration(
  p_customer_id uuid,
  p_stickers numeric,
  p_note text,
  p_service_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_employee_id uuid := public.current_employee_id();
  v_ledger_id uuid;
  v_created integer := 0;
begin
  if not public.is_rewards_customer_eligible(p_customer_id) then
    raise exception 'Cliente varios no puede migrar rewards.';
  end if;

  if coalesce(public.current_user_role(), 'viewer') not in ('owner', 'admin', 'reception') then
    raise exception 'No tienes permisos para registrar migraciones de rewards.';
  end if;

  if coalesce(p_stickers, 0) <= 0 then
    raise exception 'La cantidad de stickers debe ser mayor a cero.';
  end if;

  if nullif(btrim(coalesce(p_note, '')), '') is null then
    raise exception 'Debes registrar una nota para la migracion.';
  end if;

  insert into public.customer_reward_ledger (
    customer_id,
    movement_type,
    metric_type,
    quantity,
    amount,
    description,
    metadata,
    created_by
  )
  values (
    p_customer_id,
    'manual_migration',
    case
      when p_service_id is null then 'service_visit_count'
      else 'specific_service_count'
    end,
    p_stickers,
    0,
    case
      when p_service_id is null then 'Migracion de tarjeta fisica con stickers generales.'
      else 'Migracion de tarjeta fisica con stickers de un servicio especifico.'
    end,
    jsonb_build_object('note', p_note, 'service_id', p_service_id),
    v_employee_id
  )
  returning id into v_ledger_id;

  v_created := public.recalculate_customer_rewards(p_customer_id);

  return v_created;
end;
$$;

create or replace view public.vw_customer_rewards_summary
with (security_invoker = true) as
select
  c.id as customer_id,
  coalesce((
    select sum(l.quantity)
    from public.customer_reward_ledger l
    where l.customer_id = c.id
      and l.metric_type = 'service_visit_count'
  ), 0) as total_service_visits,
  coalesce((
    select sum(l.quantity)
    from public.customer_reward_ledger l
    where l.customer_id = c.id
      and l.metric_type = 'sale_count'
  ), 0) as total_sales_count,
  coalesce((
    select sum(l.quantity)
    from public.customer_reward_ledger l
    where l.customer_id = c.id
      and l.metric_type = 'product_purchase_count'
  ), 0) as total_product_purchases,
  coalesce((
    select sum(l.amount)
    from public.customer_reward_ledger l
    where l.customer_id = c.id
      and l.metric_type = 'amount_spent'
  ), 0) as total_amount_spent,
  coalesce((
    select count(*)
    from public.customer_reward_entitlements e
    where e.customer_id = c.id
      and e.status = 'available'
      and (e.expires_at is null or e.expires_at >= now())
  ), 0) as available_rewards_count,
  coalesce((
    select count(*)
    from public.customer_reward_entitlements e
    where e.customer_id = c.id
      and e.status = 'redeemed'
  ), 0) as redeemed_rewards_count,
  (
    select rb.name
    from public.reward_rules rr
    join public.reward_benefits rb on rb.id = rr.benefit_id
    where rr.is_active = true
      and rb.is_active = true
      and (rr.starts_at is null or rr.starts_at <= now())
      and (rr.ends_at is null or rr.ends_at >= now())
      and (
        rr.metric_type <> 'specific_service_count'
        or rr.service_id is not null
      )
      and (
        case
          when rr.metric_type = 'amount_spent' then rr.threshold_value - coalesce((
            select sum(l.amount)
            from public.customer_reward_ledger l
            where l.customer_id = c.id
              and l.metric_type = 'amount_spent'
          ), 0)
          when rr.metric_type = 'specific_service_count' then rr.threshold_value - coalesce((
            select sum(l.quantity)
            from public.customer_reward_ledger l
            where l.customer_id = c.id
              and l.metric_type = 'specific_service_count'
              and coalesce(l.metadata ->> 'service_id', '') = rr.service_id::text
          ), 0)
          else rr.threshold_value - coalesce((
            select sum(l.quantity)
            from public.customer_reward_ledger l
            where l.customer_id = c.id
              and l.metric_type = rr.metric_type
          ), 0)
        end
      ) > 0
    order by
      case
        when rr.metric_type = 'amount_spent' then rr.threshold_value - coalesce((
          select sum(l.amount)
          from public.customer_reward_ledger l
          where l.customer_id = c.id
            and l.metric_type = 'amount_spent'
        ), 0)
        when rr.metric_type = 'specific_service_count' then rr.threshold_value - coalesce((
          select sum(l.quantity)
          from public.customer_reward_ledger l
          where l.customer_id = c.id
            and l.metric_type = 'specific_service_count'
            and coalesce(l.metadata ->> 'service_id', '') = rr.service_id::text
        ), 0)
        else rr.threshold_value - coalesce((
          select sum(l.quantity)
          from public.customer_reward_ledger l
          where l.customer_id = c.id
            and l.metric_type = rr.metric_type
        ), 0)
      end asc,
      rr.created_at asc
    limit 1
  ) as next_reward_name,
  (
    select least(
      greatest(
        case
          when rr.metric_type = 'amount_spent' then rr.threshold_value - coalesce((
            select sum(l.amount)
            from public.customer_reward_ledger l
            where l.customer_id = c.id
              and l.metric_type = 'amount_spent'
          ), 0)
          when rr.metric_type = 'specific_service_count' then rr.threshold_value - coalesce((
            select sum(l.quantity)
            from public.customer_reward_ledger l
            where l.customer_id = c.id
              and l.metric_type = 'specific_service_count'
              and coalesce(l.metadata ->> 'service_id', '') = rr.service_id::text
          ), 0)
          else rr.threshold_value - coalesce((
            select sum(l.quantity)
            from public.customer_reward_ledger l
            where l.customer_id = c.id
              and l.metric_type = rr.metric_type
          ), 0)
        end,
        0
      ),
      rr.threshold_value
    )
    from public.reward_rules rr
    join public.reward_benefits rb on rb.id = rr.benefit_id
    where rr.is_active = true
      and rb.is_active = true
      and (rr.starts_at is null or rr.starts_at <= now())
      and (rr.ends_at is null or rr.ends_at >= now())
      and (
        rr.metric_type <> 'specific_service_count'
        or rr.service_id is not null
      )
      and (
        case
          when rr.metric_type = 'amount_spent' then rr.threshold_value - coalesce((
            select sum(l.amount)
            from public.customer_reward_ledger l
            where l.customer_id = c.id
              and l.metric_type = 'amount_spent'
          ), 0)
          when rr.metric_type = 'specific_service_count' then rr.threshold_value - coalesce((
            select sum(l.quantity)
            from public.customer_reward_ledger l
            where l.customer_id = c.id
              and l.metric_type = 'specific_service_count'
              and coalesce(l.metadata ->> 'service_id', '') = rr.service_id::text
          ), 0)
          else rr.threshold_value - coalesce((
            select sum(l.quantity)
            from public.customer_reward_ledger l
            where l.customer_id = c.id
              and l.metric_type = rr.metric_type
          ), 0)
        end
      ) > 0
    order by
      case
        when rr.metric_type = 'amount_spent' then rr.threshold_value - coalesce((
          select sum(l.amount)
          from public.customer_reward_ledger l
          where l.customer_id = c.id
            and l.metric_type = 'amount_spent'
        ), 0)
        when rr.metric_type = 'specific_service_count' then rr.threshold_value - coalesce((
          select sum(l.quantity)
          from public.customer_reward_ledger l
          where l.customer_id = c.id
            and l.metric_type = 'specific_service_count'
            and coalesce(l.metadata ->> 'service_id', '') = rr.service_id::text
        ), 0)
        else rr.threshold_value - coalesce((
          select sum(l.quantity)
          from public.customer_reward_ledger l
          where l.customer_id = c.id
            and l.metric_type = rr.metric_type
        ), 0)
      end asc,
      rr.created_at asc
    limit 1
  ) as next_reward_remaining
from public.customers c;

alter table public.reward_rules enable row level security;
alter table public.reward_benefits enable row level security;
alter table public.customer_reward_ledger enable row level security;
alter table public.customer_reward_entitlements enable row level security;
alter table public.reward_redemptions enable row level security;

drop policy if exists "reward_rules_select_scope" on public.reward_rules;
drop policy if exists "reward_rules_manage_admin" on public.reward_rules;
drop policy if exists "reward_rules_service_role_all" on public.reward_rules;

create policy "reward_rules_select_scope"
on public.reward_rules
for select
to authenticated
using (
  public.is_admin()
  or (public.current_user_role() = 'reception' and is_active)
);

create policy "reward_rules_manage_admin"
on public.reward_rules
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "reward_rules_service_role_all"
on public.reward_rules
for all
to service_role
using (true)
with check (true);

drop policy if exists "reward_benefits_select_scope" on public.reward_benefits;
drop policy if exists "reward_benefits_manage_admin" on public.reward_benefits;
drop policy if exists "reward_benefits_service_role_all" on public.reward_benefits;

create policy "reward_benefits_select_scope"
on public.reward_benefits
for select
to authenticated
using (
  public.is_admin()
  or (public.current_user_role() = 'reception' and is_active)
);

create policy "reward_benefits_manage_admin"
on public.reward_benefits
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "reward_benefits_service_role_all"
on public.reward_benefits
for all
to service_role
using (true)
with check (true);

drop policy if exists "customer_reward_ledger_select_scope" on public.customer_reward_ledger;
drop policy if exists "customer_reward_ledger_insert_scope" on public.customer_reward_ledger;
drop policy if exists "customer_reward_ledger_service_role_all" on public.customer_reward_ledger;

create policy "customer_reward_ledger_select_scope"
on public.customer_reward_ledger
for select
to authenticated
using (public.is_admin() or public.current_user_role() = 'reception');

create policy "customer_reward_ledger_insert_scope"
on public.customer_reward_ledger
for insert
to authenticated
with check (
  public.is_admin()
  or (
    public.current_user_role() = 'reception'
    and movement_type in ('manual_migration', 'manual_adjustment')
  )
);

create policy "customer_reward_ledger_service_role_all"
on public.customer_reward_ledger
for all
to service_role
using (true)
with check (true);

drop policy if exists "customer_reward_entitlements_select_scope" on public.customer_reward_entitlements;
drop policy if exists "customer_reward_entitlements_manage_admin" on public.customer_reward_entitlements;
drop policy if exists "customer_reward_entitlements_service_role_all" on public.customer_reward_entitlements;

create policy "customer_reward_entitlements_select_scope"
on public.customer_reward_entitlements
for select
to authenticated
using (public.is_admin() or public.current_user_role() = 'reception');

create policy "customer_reward_entitlements_manage_admin"
on public.customer_reward_entitlements
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "customer_reward_entitlements_service_role_all"
on public.customer_reward_entitlements
for all
to service_role
using (true)
with check (true);

drop policy if exists "reward_redemptions_select_scope" on public.reward_redemptions;
drop policy if exists "reward_redemptions_insert_scope" on public.reward_redemptions;
drop policy if exists "reward_redemptions_update_scope" on public.reward_redemptions;
drop policy if exists "reward_redemptions_service_role_all" on public.reward_redemptions;

create policy "reward_redemptions_select_scope"
on public.reward_redemptions
for select
to authenticated
using (public.is_admin() or public.current_user_role() = 'reception');

create policy "reward_redemptions_insert_scope"
on public.reward_redemptions
for insert
to authenticated
with check (public.is_admin() or public.current_user_role() = 'reception');

create policy "reward_redemptions_update_scope"
on public.reward_redemptions
for update
to authenticated
using (public.is_admin() or public.current_user_role() = 'reception')
with check (public.is_admin() or public.current_user_role() = 'reception');

create policy "reward_redemptions_service_role_all"
on public.reward_redemptions
for all
to service_role
using (true)
with check (true);

grant select, insert, update on public.reward_rules to authenticated;
grant select, insert, update on public.reward_benefits to authenticated;
grant select, insert on public.customer_reward_ledger to authenticated;
grant select, update on public.customer_reward_entitlements to authenticated;
grant select, insert, update on public.reward_redemptions to authenticated;

grant all on public.reward_rules to service_role;
grant all on public.reward_benefits to service_role;
grant all on public.customer_reward_ledger to service_role;
grant all on public.customer_reward_entitlements to service_role;
grant all on public.reward_redemptions to service_role;

revoke all on public.reward_rules from public;
revoke all on public.reward_benefits from public;
revoke all on public.customer_reward_ledger from public;
revoke all on public.customer_reward_entitlements from public;
revoke all on public.reward_redemptions from public;

revoke all on function public.mark_expired_reward_entitlements(uuid) from public;
revoke all on function public.is_rewards_customer_eligible(uuid) from public;
revoke all on function public.get_reward_metric_total(uuid, text) from public;
revoke all on function public.issue_reward_entitlements_for_metric(uuid, text, numeric, uuid) from public;
revoke all on function public.process_rewards_for_completed_sale(uuid) from public;
revoke all on function public.reverse_rewards_for_cancelled_sale(uuid) from public;
revoke all on function public.apply_reward_to_sale(uuid, uuid) from public;
revoke all on function public.recalculate_customer_rewards(uuid) from public;
revoke all on function public.register_reward_card_migration(uuid, numeric, text, uuid) from public;

grant execute on function public.mark_expired_reward_entitlements(uuid) to authenticated, service_role;
grant execute on function public.is_rewards_customer_eligible(uuid) to authenticated, service_role;
grant execute on function public.get_reward_metric_total(uuid, text) to authenticated, service_role;
grant execute on function public.issue_reward_entitlements_for_metric(uuid, text, numeric, uuid) to authenticated, service_role;
grant execute on function public.process_rewards_for_completed_sale(uuid) to authenticated, service_role;
grant execute on function public.reverse_rewards_for_cancelled_sale(uuid) to authenticated, service_role;
grant execute on function public.apply_reward_to_sale(uuid, uuid) to authenticated, service_role;
grant execute on function public.recalculate_customer_rewards(uuid) to authenticated, service_role;
grant execute on function public.register_reward_card_migration(uuid, numeric, text, uuid) to authenticated, service_role;

create or replace function public.complete_sale(p_sale_id uuid)
returns public.sales
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale public.sales%rowtype;
  v_employee_id uuid := public.current_employee_id();
  v_item_count integer := 0;
  v_service_count integer := 0;
  v_barber_covered boolean := false;
  v_stock_issue text;
begin
  v_sale := public.recalculate_sale_totals(p_sale_id);
  v_sale := public.recalculate_sale_payment_totals(p_sale_id);

  select *
  into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'La venta no existe.';
  end if;

  if not public.can_manage_pos_branch(v_sale.branch_id) then
    raise exception 'No tienes permisos para completar esta venta.';
  end if;

  if v_sale.status <> 'draft' then
    raise exception 'Solo las ventas en borrador se pueden completar.';
  end if;

  if not exists (
    select 1
    from public.pos_sessions ps
    where ps.id = v_sale.pos_session_id
      and ps.branch_id = v_sale.branch_id
      and ps.status = 'open'
  ) then
    raise exception 'La venta requiere una sesion POS abierta de la misma sede.';
  end if;

  select count(*)
  into v_item_count
  from public.sale_items si
  where si.sale_id = p_sale_id;

  if v_item_count = 0 then
    raise exception 'La venta debe tener al menos un item.';
  end if;

  if v_sale.paid_total < v_sale.total then
    raise exception 'Los pagos registrados no cubren el total de la venta.';
  end if;

  select count(*)
  into v_service_count
  from public.sale_items si
  where si.sale_id = p_sale_id
    and si.item_type = 'service';

  if v_service_count > 0 then
    select (
      v_sale.barber_id is not null
      or exists (
        select 1
        from public.sale_items si
        where si.sale_id = p_sale_id
          and si.item_type = 'service'
          and si.barber_id is not null
      )
    )
    into v_barber_covered;

    if not v_barber_covered then
      raise exception 'Las ventas con servicios requieren un barbero asignado.';
    end if;
  end if;

  select concat('Stock insuficiente para ', p.name)
  into v_stock_issue
  from (
    select
      si.product_id,
      sum(si.quantity) as required_quantity
    from public.sale_items si
    join public.products p0 on p0.id = si.product_id
    where si.sale_id = p_sale_id
      and si.item_type = 'product'
      and p0.is_stockable = true
    group by si.product_id
  ) required
  join public.products p on p.id = required.product_id
  join public.vw_product_stock stock
    on stock.product_id = required.product_id
   and stock.branch_id = v_sale.branch_id
  where stock.stock_quantity < required.required_quantity
  limit 1;

  if v_stock_issue is not null then
    raise exception '%', v_stock_issue;
  end if;

  insert into public.stock_movements (
    product_id,
    branch_id,
    movement_type,
    quantity,
    unit_cost,
    reference_type,
    reference_id,
    notes,
    created_by
  )
  select
    si.product_id,
    v_sale.branch_id,
    case when si.is_courtesy then 'courtesy' else 'sale' end,
    si.quantity,
    coalesce(si.cost_snapshot, p.cost_price),
    'sale',
    v_sale.id,
    case
      when si.is_courtesy then 'Descuento de stock por cortesia en venta completada.'
      else 'Descuento de stock por venta completada.'
    end,
    v_employee_id
  from public.sale_items si
  join public.products p on p.id = si.product_id
  where si.sale_id = p_sale_id
    and si.item_type = 'product'
    and p.is_stockable = true;

  update public.sales
  set status = 'completed',
      paid_total = greatest(paid_total, total),
      change_amount = greatest(paid_total - total, 0),
      closed_by = v_employee_id,
      closed_at = now(),
      cancelled_by = null,
      cancelled_at = null,
      cancelled_reason = null
  where id = p_sale_id
  returning *
  into v_sale;

  if v_sale.reservation_id is not null then
    update public.reservations
    set status = 'completed',
        completed_at = now(),
        updated_by = v_employee_id
    where id = v_sale.reservation_id;
  end if;

  perform public.process_rewards_for_completed_sale(v_sale.id);
  perform public.sync_pos_session_totals(v_sale.pos_session_id);

  insert into public.pos_session_events (
    pos_session_id,
    employee_id,
    event_type,
    message,
    metadata
  )
  values (
    v_sale.pos_session_id,
    v_employee_id,
    'sale_completed',
    'Venta completada.',
    jsonb_build_object(
      'sale_id', v_sale.id,
      'total', v_sale.total,
      'customer_id', v_sale.customer_id
    )
  );

  return v_sale;
end;
$$;

create or replace function public.cancel_completed_sale(
  p_sale_id uuid,
  p_reason text
)
returns public.sales
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale public.sales%rowtype;
  v_employee_id uuid := public.current_employee_id();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select *
  into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'La venta no existe.';
  end if;

  if not public.can_manage_pos_branch(v_sale.branch_id) then
    raise exception 'No tienes permisos para anular esta venta.';
  end if;

  if v_sale.status <> 'completed' then
    raise exception 'Solo se pueden anular ventas completadas.';
  end if;

  if not exists (
    select 1
    from public.pos_sessions ps
    where ps.id = v_sale.pos_session_id
      and ps.status = 'open'
  ) then
    raise exception 'Solo se puede anular una venta mientras la sesion POS este abierta.';
  end if;

  if v_reason is null then
    raise exception 'Debes indicar el motivo de anulacion.';
  end if;

  insert into public.stock_movements (
    product_id,
    branch_id,
    movement_type,
    quantity,
    unit_cost,
    reference_type,
    reference_id,
    notes,
    created_by
  )
  select
    si.product_id,
    v_sale.branch_id,
    'adjustment',
    si.quantity,
    coalesce(si.cost_snapshot, p.cost_price),
    'sale_cancellation',
    v_sale.id,
    'Reversion de stock por anulacion de venta completada.',
    v_employee_id
  from public.sale_items si
  join public.products p on p.id = si.product_id
  where si.sale_id = p_sale_id
    and si.item_type = 'product'
    and p.is_stockable = true;

  update public.sales
  set status = 'cancelled',
      cancelled_reason = v_reason,
      cancelled_by = v_employee_id,
      cancelled_at = now()
  where id = p_sale_id
  returning *
  into v_sale;

  if v_sale.reservation_id is not null then
    update public.reservations
    set status = 'checked_in',
        completed_at = null,
        updated_by = v_employee_id
    where id = v_sale.reservation_id;
  end if;

  perform public.reverse_rewards_for_cancelled_sale(v_sale.id);
  perform public.sync_pos_session_totals(v_sale.pos_session_id);

  insert into public.pos_session_events (
    pos_session_id,
    employee_id,
    event_type,
    message,
    metadata
  )
  values (
    v_sale.pos_session_id,
    v_employee_id,
    'sale_cancelled',
    'Venta anulada.',
    jsonb_build_object(
      'sale_id', v_sale.id,
      'reason', v_reason
    )
  );

  return v_sale;
end;
$$;
