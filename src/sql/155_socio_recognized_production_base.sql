-- Reglas propias de Socios con producción reconocida.
-- Ejecutar después de 154_socios_reusing_internal_benefits.sql.
-- Una atención de socio puede costar S/ 0, pero reconoce una base por servicio
-- para liquidar al barbero. No modifica ventas ni producciones históricas.

alter table public.employee_benefit_rules
  add column if not exists beneficiary_scope text not null default 'employee';
alter table public.employee_benefit_rules
  drop constraint if exists employee_benefit_rules_beneficiary_scope_check;
alter table public.employee_benefit_rules
  add constraint employee_benefit_rules_beneficiary_scope_check
  check (beneficiary_scope in ('employee', 'socio', 'both'));
alter table public.employee_benefit_rules
  add column if not exists recognized_production_amount numeric(12,2) not null default 0;
alter table public.employee_benefit_rules
  drop constraint if exists employee_benefit_rules_recognized_production_amount_check;
alter table public.employee_benefit_rules
  add constraint employee_benefit_rules_recognized_production_amount_check
  check (recognized_production_amount >= 0);

-- Las asignaciones de socio creadas antes de esta mejora continúan visibles.
update public.employee_benefit_rules rule
set beneficiary_scope = 'both'
where beneficiary_scope = 'employee'
  and exists (
    select 1
    from public.socio_benefit_assignments assignment
    where assignment.benefit_rule_id = rule.id
  );

alter table public.internal_pos_operations
  add column if not exists recognized_production_amount numeric(12,2) not null default 0;
alter table public.internal_pos_operations
  drop constraint if exists internal_pos_operations_recognized_production_amount_check;
alter table public.internal_pos_operations
  add constraint internal_pos_operations_recognized_production_amount_check
  check (recognized_production_amount >= 0);

-- Se mantiene el mismo contrato POS, pero se separa el alcance de empleado y socio.
create or replace function public.get_pos_internal_options(p_customer_id uuid,p_branch_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_link public.employee_customer_links%rowtype;
  v_employee public.employees%rowtype;
  v_socio public.socios%rowtype;
  v_rules jsonb;
  v_kind text;
begin
  if public.current_employee_id() is null or not public.can_manage_pos_branch(p_branch_id) then
    raise exception 'No tienes permisos para consultar opciones internas de esta sede.';
  end if;

  select * into v_socio
  from public.socios
  where customer_id=p_customer_id and status='active'
    and starts_at<=public.pos_business_date()
    and (ends_at is null or ends_at>=public.pos_business_date())
    and (branch_id is null or branch_id=p_branch_id)
  limit 1;

  if found then
    v_kind := 'socio';
  else
    select * into v_link from public.employee_customer_links
    where customer_id=p_customer_id and is_active limit 1;
    if found then
      select * into v_employee from public.employees where id=v_link.employee_id and status='active';
      if found then v_kind := 'employee'; end if;
    end if;
  end if;

  if v_kind is null then
    return jsonb_build_object('employee',null,'socio',null,'beneficiaryType',null,'canUseCredit',false,'rules','[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'name',r.name,'description',r.description,'applies_to',r.applies_to,
    'service_id',r.service_id,'product_id',r.product_id,'benefit_type',r.benefit_type,
    'benefit_value',r.benefit_value,'usage_limit',r.usage_limit,'period_kind',r.period_kind,
    'production_mode',r.production_mode,'fixed_barber_payout',r.fixed_barber_payout,
    'operational_contribution',r.operational_contribution,
    'recognized_production_amount',r.recognized_production_amount,
    'beneficiary_scope',r.beneficiary_scope,
    'requires_owner_authorization',r.requires_owner_authorization,
    'is_internal_complimentary',r.is_internal_complimentary
  ) order by r.name),'[]'::jsonb)
  into v_rules
  from public.employee_benefit_rules r
  where r.is_active
    and r.effective_from<=public.pos_business_date()
    and (r.effective_to is null or r.effective_to>=public.pos_business_date())
    and (r.branch_id is null or r.branch_id=p_branch_id)
    and (
      (v_kind='socio'
        and r.beneficiary_scope = 'socio'
        and exists (
          select 1 from public.socio_benefit_assignments a
          where a.socio_id=v_socio.id and a.benefit_rule_id=r.id and a.status='active'
            and a.starts_at<=public.pos_business_date()
            and (a.ends_at is null or a.ends_at>=public.pos_business_date())
        )
      )
      or
      (v_kind='employee'
        and r.beneficiary_scope in ('employee','both')
        and (r.eligible_role is null or r.eligible_role=v_employee.role::text)
        and (
          not exists(select 1 from public.employee_benefit_rule_employees t where t.rule_id=r.id)
          or exists(select 1 from public.employee_benefit_rule_employees t where t.rule_id=r.id and t.employee_id=v_employee.id)
        )
      )
    );

  return jsonb_build_object(
    'employee',case when v_kind='employee' then jsonb_build_object('id',v_employee.id,'fullName',v_employee.full_name,'role',v_employee.role) else null end,
    'socio',case when v_kind='socio' then jsonb_build_object('id',v_socio.id,'customerId',v_socio.customer_id,'code',v_socio.code) else null end,
    'beneficiaryType',v_kind,
    'canUseCredit',case when v_kind='employee' then v_link.can_use_internal_credit else false end,
    'rules',v_rules
  );
end;
$$;

-- El checkout toma una instantánea de los importes de la regla para que futuras
-- ediciones nunca cambien la liquidación de una venta ya realizada.
create or replace function public.checkout_socio_benefit_sale(p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_sale uuid; v_socio public.socios%rowtype; v_rule public.employee_benefit_rules%rowtype;
  v_operator uuid:=public.current_employee_id(); v_item jsonb; v_payment jsonb;
  v_branch uuid:=(p_payload->>'branch_id')::uuid; v_customer uuid:=(p_payload->>'customer_id')::uuid;
  v_rule_id uuid:=(p_payload->>'socio_benefit_rule_id')::uuid; v_subtotal numeric:=0;
  v_discount_total numeric:=0; v_line numeric; v_discount numeric; v_paid numeric;
  v_total numeric; v_period date; v_used integer; v_matches boolean;
begin
  if v_operator is null or not public.can_manage_pos_branch(v_branch) then
    raise exception 'No tienes permisos para cerrar ventas en esta sede.';
  end if;
  if v_rule_id is null or coalesce((p_payload->>'internal_credit')::boolean,false) then
    raise exception 'La operación de socio no permite crédito interno.';
  end if;
  if nullif(p_payload->>'reward_entitlement_id','') is not null
    or exists(select 1 from jsonb_array_elements(p_payload->'items') i where coalesce((i->>'is_courtesy')::boolean,false)) then
    raise exception 'No puedes combinar Rewards ni cortesías comerciales con un beneficio de socio.';
  end if;

  select * into v_socio from public.socios
  where customer_id=v_customer and status='active'
    and starts_at<=public.pos_business_date()
    and (ends_at is null or ends_at>=public.pos_business_date())
    and (branch_id is null or branch_id=v_branch)
  for share;
  if not found then raise exception 'El cliente no es un socio activo para esta sede.'; end if;

  select r.* into v_rule
  from public.employee_benefit_rules r
  join public.socio_benefit_assignments a on a.benefit_rule_id=r.id
  where r.id=v_rule_id and r.beneficiary_scope = 'socio' and r.is_active
    and r.effective_from<=public.pos_business_date()
    and (r.effective_to is null or r.effective_to>=public.pos_business_date())
    and a.socio_id=v_socio.id and a.status='active'
    and a.starts_at<=public.pos_business_date()
    and (a.ends_at is null or a.ends_at>=public.pos_business_date())
  for share;
  if not found then raise exception 'El beneficio de socio ya no está disponible.'; end if;

  v_period:=public.internal_benefit_period_start(v_rule.period_kind,public.pos_business_date());
  if v_rule.period_kind<>'none' then
    select count(*) into v_used
    from public.internal_pos_operations o join public.sales s on s.id=o.sale_id
    where o.socio_id=v_socio.id and o.benefit_rule_id=v_rule.id
      and s.status='completed' and s.accounting_date>=v_period;
    if v_used>=v_rule.usage_limit then
      raise exception 'El socio ya alcanzó el límite de este beneficio en el período vigente.';
    end if;
  end if;

  insert into public.sales(pos_session_id,branch_id,customer_id,barber_id,status,subtotal,discount_total,courtesy_total,total,paid_total,change_amount,checkout_idempotency_key,notes,created_by,operation_kind)
  values((p_payload->>'pos_session_id')::uuid,v_branch,v_customer,nullif(p_payload->>'barber_id','')::uuid,'draft',0,0,0,0,0,0,nullif(p_payload->>'idempotency_key',''),nullif(btrim(coalesce(p_payload->>'notes','')),''),v_operator,'socio_benefit')
  returning id into v_sale;

  for v_item in select value from jsonb_array_elements(p_payload->'items') loop
    v_line:=round((v_item->>'quantity')::numeric*(v_item->>'unit_price')::numeric,2);
    v_matches:=v_rule.applies_to='all' or (
      v_rule.applies_to=v_item->>'item_type' and (
        ((v_item->>'item_type')='service' and (v_rule.service_id is null or v_rule.service_id=(v_item->>'service_id')::uuid))
        or ((v_item->>'item_type')='product' and (v_rule.product_id is null or v_rule.product_id=(v_item->>'product_id')::uuid))
      )
    );
    v_discount:=case when v_matches then case v_rule.benefit_type
      when 'free' then v_line
      when 'fixed_price' then greatest(v_line-round(v_rule.benefit_value*(v_item->>'quantity')::numeric,2),0)
      else round(v_line*v_rule.benefit_value/100,2)
    end else 0 end;
    v_subtotal:=v_subtotal+v_line;
    v_discount_total:=v_discount_total+v_discount;
    insert into public.sale_items(sale_id,item_type,service_id,product_id,description_snapshot,quantity,unit_price,discount_amount,total,cost_snapshot,barber_id,is_courtesy,original_unit_price,original_total)
    values(v_sale,v_item->>'item_type',nullif(v_item->>'service_id','')::uuid,nullif(v_item->>'product_id','')::uuid,coalesce(nullif(v_item->>'description_snapshot',''),'Item POS'),(v_item->>'quantity')::numeric,(v_item->>'unit_price')::numeric,v_discount,v_line-v_discount,nullif(v_item->>'cost_snapshot','')::numeric,nullif(v_item->>'barber_id','')::uuid,false,v_line/(v_item->>'quantity')::numeric,v_line);
  end loop;

  update public.sales set subtotal=round(v_subtotal,2),discount_total=round(v_discount_total,2),total=round(v_subtotal-v_discount_total,2) where id=v_sale;
  select total into v_total from public.sales where id=v_sale;
  select coalesce(sum((value->>'amount')::numeric),0) into v_paid from jsonb_array_elements(coalesce(p_payload->'payments','[]'::jsonb));
  if round(v_paid,2)<>round(v_total,2) then raise exception 'El monto pagado no cubre el total final de la venta.'; end if;
  for v_payment in select value from jsonb_array_elements(coalesce(p_payload->'payments','[]'::jsonb)) loop
    insert into public.sale_payments(sale_id,payment_method_id,amount,tendered_amount,change_amount)
    values(v_sale,(v_payment->>'payment_method_id')::uuid,(v_payment->>'amount')::numeric,(v_payment->>'tendered_amount')::numeric,coalesce((v_payment->>'change_amount')::numeric,0));
  end loop;

  insert into public.internal_pos_operations(sale_id,socio_id,customer_id,benefit_rule_id,operation_kind,retail_amount,discount_amount,credit_amount,fixed_barber_payout,operational_contribution,recognized_production_amount,created_by)
  values(v_sale,v_socio.id,v_customer,v_rule.id,'socio_benefit',v_subtotal,v_discount_total,0,v_rule.fixed_barber_payout,v_rule.operational_contribution,v_rule.recognized_production_amount,v_operator);
  perform public.complete_sale(v_sale);
  return v_sale;
end;
$$;

-- Para Socios, la base no depende de lo cobrado (que es S/ 0), sino de la
-- instantánea de producción reconocida menos su aporte por cada servicio.
create or replace function public.apply_employee_benefit_production_mode()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_mode text;
  v_fixed_payout numeric(12,2);
  v_operation_kind text;
  v_recognized_per_service numeric(12,2);
  v_contribution_per_service numeric(12,2);
  v_recognized_total numeric(12,2);
  v_contribution_total numeric(12,2);
begin
  if new.production_source <> 'employee_benefit' then return new; end if;

  select operation.operation_kind, rule.production_mode, operation.fixed_barber_payout,
    operation.recognized_production_amount, operation.operational_contribution
  into v_operation_kind, v_mode, v_fixed_payout, v_recognized_per_service, v_contribution_per_service
  from public.internal_pos_operations operation
  join public.employee_benefit_rules rule on rule.id=operation.benefit_rule_id
  where operation.sale_id=new.sale_id;
  if not found then return new; end if;

  if v_operation_kind='socio_benefit' then
    v_recognized_total:=round(greatest(coalesce(v_recognized_per_service,0),0)*coalesce(new.quantity,0),2);
    v_contribution_total:=least(v_recognized_total,round(greatest(coalesce(v_contribution_per_service,0),0)*coalesce(new.quantity,0),2));
    update public.employee_service_production
    set operational_contribution_amount=v_contribution_total,
        commissionable_amount=case when v_mode='percentage' then greatest(v_recognized_total-v_contribution_total,0) else 0 end,
        fixed_commission_amount=case when v_mode='fixed' then coalesce(v_fixed_payout,0) else 0 end,
        updated_at=now()
    where id=new.id;
  else
    update public.employee_service_production
    set fixed_commission_amount=case when v_mode='fixed' then coalesce(v_fixed_payout,0) else 0 end,
        commissionable_amount=case when v_mode='percentage' then greatest(coalesce(new.collected_amount,0)-coalesce(new.operational_contribution_amount,0),0) else 0 end,
        updated_at=now()
    where id=new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.get_pos_internal_options(uuid,uuid), public.checkout_socio_benefit_sale(jsonb), public.apply_employee_benefit_production_mode() from public,anon;
grant execute on function public.get_pos_internal_options(uuid,uuid), public.checkout_socio_benefit_sale(jsonb), public.apply_employee_benefit_production_mode() to authenticated,service_role;

notify pgrst,'reload schema';
