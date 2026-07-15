-- Sprint 8.5
-- Ejecutar manualmente en Supabase SQL Editor.

create or replace function public.get_reward_issued_count(
  p_customer_id uuid,
  p_rule_id uuid
)
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  select count(*)::integer
  from public.customer_reward_entitlements cre
  where cre.customer_id = p_customer_id
    and cre.rule_id = p_rule_id
    and cre.status in ('available', 'redeemed', 'expired')
$$;

create or replace function public.get_reward_effective_balance(
  p_customer_id uuid,
  p_rule_id uuid,
  p_metric_type text,
  p_service_id uuid,
  p_threshold numeric
)
returns numeric
language sql
security definer
set search_path = public, pg_temp
as $$
  select greatest(
    public.get_reward_metric_total(
      p_customer_id,
      p_metric_type,
      p_service_id
    ) - (public.get_reward_issued_count(p_customer_id, p_rule_id) * p_threshold),
    0
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

    v_existing_count := public.get_reward_issued_count(p_customer_id, v_rule.id);
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
        rr.threshold_value - public.get_reward_effective_balance(
          c.id,
          rr.id,
          rr.metric_type,
          rr.service_id,
          rr.threshold_value
        )
      ) > 0
    order by
      (
        rr.threshold_value - public.get_reward_effective_balance(
          c.id,
          rr.id,
          rr.metric_type,
          rr.service_id,
          rr.threshold_value
        )
      ) asc,
      rr.created_at asc
    limit 1
  ) as next_reward_name,
  (
    select least(
      greatest(
        rr.threshold_value - public.get_reward_effective_balance(
          c.id,
          rr.id,
          rr.metric_type,
          rr.service_id,
          rr.threshold_value
        ),
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
        rr.threshold_value - public.get_reward_effective_balance(
          c.id,
          rr.id,
          rr.metric_type,
          rr.service_id,
          rr.threshold_value
        )
      ) > 0
    order by
      (
        rr.threshold_value - public.get_reward_effective_balance(
          c.id,
          rr.id,
          rr.metric_type,
          rr.service_id,
          rr.threshold_value
        )
      ) asc,
      rr.created_at asc
    limit 1
  ) as next_reward_remaining
from public.customers c
where lower(trim(c.full_name)) <> 'cliente varios';
