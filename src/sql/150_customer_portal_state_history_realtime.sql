-- Cierre Fase 1: estado central, historial privado de Rewards y Realtime seguro.

drop policy if exists customer_link_requests_self_select on public.customer_link_requests;
create policy customer_link_requests_self_select on public.customer_link_requests
for select to authenticated
using (auth_user_id = (select auth.uid()));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'customer_link_requests'
  ) then
    alter publication supabase_realtime add table public.customer_link_requests;
  end if;
end $$;

create or replace function public.get_customer_profile()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_customer public.customers%rowtype; v_rewards record;
begin
  select c.* into v_customer from public.customer_accounts ca join public.customers c on c.id=ca.customer_id where ca.auth_user_id=auth.uid() and ca.status='active';
  if not found then raise exception 'La cuenta de cliente no está vinculada.'; end if;
  select * into v_rewards from public.vw_customer_rewards_summary where customer_id=v_customer.id;
  return jsonb_build_object('firstName',v_customer.first_name,'lastName',v_customer.last_name,'email',v_customer.email,'documentType',v_customer.document_type,'documentNumberMasked',case when length(coalesce(v_customer.document_number,''))>4 then repeat('*',length(v_customer.document_number)-4)||right(v_customer.document_number,4) else v_customer.document_number end,'phone',v_customer.phone,'attentions',coalesce(v_rewards.total_service_visits,0),'availableRewards',coalesce(v_rewards.available_rewards_count,0));
end; $$;

create or replace function public.get_customer_reward_movements(p_limit integer default 20,p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_customer_id uuid; v_items jsonb; v_total integer; v_limit integer:=least(greatest(coalesce(p_limit,20),1),50); v_offset integer:=greatest(coalesce(p_offset,0),0);
begin
  select customer_id into v_customer_id from public.customer_accounts where auth_user_id=auth.uid() and status='active';
  if v_customer_id is null then raise exception 'La cuenta de cliente no está vinculada.'; end if;
  with events as (
    select l.created_at as occurred_at,
      case when l.movement_type='manual_migration' then 'physical_migration' when l.movement_type='reversal' then 'reversal' when l.movement_type='manual_adjustment' then 'adjustment' else 'attention' end as type,
      case when l.movement_type='manual_migration' then 'Tarjeta física migrada' when l.movement_type='reversal' then 'Atención revertida' when l.movement_type='manual_adjustment' then 'Ajuste Rewards' else 'Atención registrada' end as title,
      case when l.movement_type='manual_migration' then 'Tarjeta física migrada' when l.movement_type='reversal' then 'Una atención fue revertida' when l.movement_type='manual_adjustment' then 'Actualización de Rewards' else coalesce((select string_agg(s.name, ', ') from public.sale_items si join public.services s on s.id=si.service_id where si.sale_id=l.sale_id and si.item_type='service'),'Atención de servicio') end as description,
      case when l.metric_type='amount_spent' then l.amount else l.quantity end as value,
      case when l.metric_type='amount_spent' then 'soles' else 'atenciones' end as unit,
      case when l.movement_type='reversal' then 'reverted' else 'active' end as status
    from public.customer_reward_ledger l where l.customer_id=v_customer_id
    union all
    select e.earned_at,'reward_earned','Reward disponible',b.name,1,'reward',case when e.status='cancelled' then 'cancelled' else 'active' end from public.customer_reward_entitlements e join public.reward_benefits b on b.id=e.benefit_id where e.customer_id=v_customer_id
    union all
    select r.applied_at,'reward_redeemed','Reward utilizado',b.name,1,'reward',r.status from public.reward_redemptions r join public.reward_benefits b on b.id=r.benefit_id where r.customer_id=v_customer_id
  ), numbered as (select *,count(*) over() as total_count from events)
  select coalesce(jsonb_agg(jsonb_build_object('type',type,'title',title,'description',description,'date',occurred_at,'value',value,'unit',unit,'status',status) order by occurred_at desc),'[]'::jsonb),coalesce(max(total_count),0) into v_items,v_total from (select * from numbered order by occurred_at desc offset v_offset limit v_limit) page;
  return jsonb_build_object('items',v_items,'offset',v_offset,'limit',v_limit,'total',v_total,'hasMore',v_offset+v_limit<v_total);
end; $$;

revoke all on function public.get_customer_profile(),public.get_customer_reward_movements(integer,integer) from public,anon;
grant execute on function public.get_customer_profile(),public.get_customer_reward_movements(integer,integer) to authenticated;
notify pgrst,'reload schema';
