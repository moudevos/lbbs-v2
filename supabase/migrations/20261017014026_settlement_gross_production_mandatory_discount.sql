begin;

alter table public.employee_settlements
  add column if not exists gross_production_total numeric(12,2);

comment on column public.employee_settlements.gross_production_total is
  'Valor comercial bruto atribuido al empleado: servicios + productos antes de aportes, descuentos o comisiones.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'employee_settlements_gross_production_total_check'
      and conrelid = 'public.employee_settlements'::regclass
  ) then
    alter table public.employee_settlements
      add constraint employee_settlements_gross_production_total_check
      check (gross_production_total is null or gross_production_total >= 0);
  end if;
end
$$;

CREATE OR REPLACE FUNCTION public.prepare_employee_settlement(p_period_id uuid, p_employee_id uuid, p_commission_rate numeric DEFAULT NULL::numeric, p_debt_deductions jsonb DEFAULT '[]'::jsonb, p_notes text DEFAULT NULL::text, p_high_rate_note text DEFAULT NULL::text)
 RETURNS employee_settlements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_settlement public.employee_settlements%rowtype;
  v_rate numeric(7,4) := 0;
  v_commissionable numeric(12,2) := 0;
  v_percentage numeric(12,2) := 0;
  v_reward_fixed numeric(12,2) := 0;
  v_courtesy_fixed numeric(12,2) := 0;
  v_bonus numeric(12,2) := 0;
  v_recognized numeric(12,2) := 0;
  v_reward_percentage numeric(12,2) := 0;
  v_service_count integer := 0;
  v_reward_count integer := 0;
  v_product_count integer := 0;
  v_gross numeric(12,2) := 0;
  v_gross_production numeric(12,2) := 0;
begin

  select *
  into v_settlement
  from public.prepare_employee_settlement_v179(
    p_period_id,
    p_employee_id,
    p_commission_rate,
    p_debt_deductions,
    p_notes,
    p_high_rate_note
  );

  v_rate := greatest(
    coalesce(v_settlement.commission_rate, 0),
    0
  );

  -- Actualiza snapshots y comisiones de cada línea.
  update public.employee_settlement_service_lines line
  set
    production_source_snapshot =
      production.production_source,

    original_line_total_snapshot =
      greatest(
        coalesce(production.original_line_total, 0),
        0
      ),

    recognized_production_amount_snapshot =
      greatest(
        coalesce(
          production.recognized_production_amount,
          0
        ),
        0
      ),

    operational_contribution_snapshot =
      greatest(
        coalesce(
          production.operational_contribution_amount,
          0
        ),
        0
      ),

    reward_commission_mode_snapshot =
      production.reward_commission_mode,

    reward_commission_basis_snapshot =
      greatest(
        coalesce(
          production.reward_commission_basis_amount,
          0
        ),
        0
      ),

    commission_rate =
      case
        when production.production_source
          in ('normal', 'commercial_discount')
          then v_rate

        when production.production_source = 'reward'
          and production.reward_commission_mode = 'percentage'
          then v_rate

        else 0
      end,

    commission_amount =
      case
        when production.production_source
          in ('normal', 'commercial_discount')
          then round(
            greatest(
              coalesce(line.commissionable_amount, 0),
              0
            ) * v_rate / 100,
            2
          )

        when production.production_source = 'reward'
          and production.reward_commission_mode = 'percentage'
          then round(
            greatest(
              coalesce(line.commissionable_amount, 0),
              0
            ) * v_rate / 100,
            2
          )

        else 0
      end,

    fixed_commission_amount =
      case
        when production.production_source = 'reward'
          and production.reward_commission_mode = 'fixed'
          then greatest(
            coalesce(
              production.fixed_commission_amount,
              0
            ),
            0
          )

        else greatest(
          coalesce(
            production.fixed_commission_amount,
            line.fixed_commission_amount,
            0
          ),
          0
        )
      end

  from public.employee_service_production production

  where line.settlement_id = v_settlement.id
    and production.id = line.production_entry_id;


  -- Calcula la base comisionable REAL de la liquidación.
  select
    coalesce(
      sum(line.commissionable_amount),
      0
    ),

    coalesce(
      sum(line.commission_amount),
      0
    ),

    coalesce(
      sum(line.fixed_commission_amount)
        filter (
          where line.production_source_snapshot = 'reward'
        ),
      0
    ),

    coalesce(
      sum(line.fixed_commission_amount)
        filter (
          where line.production_source_snapshot = 'courtesy'
        ),
      0
    ),

    coalesce(
      sum(line.commission_amount)
        filter (
          where line.production_source_snapshot = 'reward'
            and line.reward_commission_mode_snapshot = 'percentage'
        ),
      0
    ),

    count(*)
      filter (
        where line.production_source_snapshot <> 'reward'
      ),

    count(*)
      filter (
        where line.production_source_snapshot = 'reward'
      )

  into
    v_commissionable,
    v_percentage,
    v_reward_fixed,
    v_courtesy_fixed,
    v_reward_percentage,
    v_service_count,
    v_reward_count

  from public.employee_settlement_service_lines line

  where line.settlement_id = v_settlement.id;


  select
    coalesce(sum(line.bonus_amount), 0),
    count(*)

  into
    v_bonus,
    v_product_count

  from public.employee_settlement_bonus_lines line

  where line.settlement_id = v_settlement.id;


  -- Producción bruta atribuida: valor comercial original de servicios
  -- y productos, sin restar aportes, descuentos ni comisiones.
  select round(
    coalesce((
      select sum(greatest(coalesce(line.original_line_total_snapshot, 0), 0))
      from public.employee_settlement_service_lines line
      where line.settlement_id = v_settlement.id
    ), 0)
    +
    coalesce((
      select sum(greatest(coalesce(line.commercial_amount_snapshot, 0), 0))
      from public.employee_settlement_product_lines line
      where line.settlement_id = v_settlement.id
    ), 0),
    2
  )
  into v_gross_production;

  -- Se mantiene producción reconocida únicamente como métrica
  -- informativa / de trazabilidad.
  v_recognized :=
    public.get_employee_recognized_production(
      p_period_id,
      p_employee_id
    );


  v_gross := round(
    v_percentage
    + v_reward_fixed
    + v_courtesy_fixed
    + v_bonus
    + coalesce(
        v_settlement.fixed_compensation_total,
        0
      ),
    2
  );


  -- El descuento obligatorio usa la producción bruta atribuida.
  -- La base comisionable permanece independiente para el cálculo de comisión.

  update public.employee_settlements
  set

    gross_production_total =
      round(v_gross_production, 2),

    commissionable_base_total =
      round(v_commissionable, 2),

    percentage_commission_total =
      round(v_percentage, 2),

    reward_fixed_commission_total =
      round(v_reward_fixed, 2),

    courtesy_fixed_commission_total =
      round(v_courtesy_fixed, 2),

    product_bonus_total =
      round(v_bonus, 2),

    reward_percentage_commission_total =
      round(v_reward_percentage, 2),

    total_service_count =
      coalesce(v_service_count, 0),

    total_product_count =
      coalesce(v_product_count, 0),

    total_reward_count =
      coalesce(v_reward_count, 0),

    total_production_amount =
      round(v_recognized, 2),

    recognized_production_total =
      round(v_recognized, 2),

    mandatory_discount_base_amount =
      case
        when coalesce(
          v_settlement.mandatory_discount_enabled_snapshot,
          true
        )
        then round(v_gross_production, 2)
        else 0
      end,

    gross_pay_amount =
      v_gross

  where id = v_settlement.id

  returning *
  into v_settlement;


  return v_settlement;
end;
$function$
;

with gross as (
  select
    settlement.id,
    round(
      coalesce((
        select sum(greatest(coalesce(service.original_line_total_snapshot, 0), 0))
        from public.employee_settlement_service_lines service
        where service.settlement_id = settlement.id
      ), 0)
      +
      coalesce((
        select sum(greatest(coalesce(product.commercial_amount_snapshot, 0), 0))
        from public.employee_settlement_product_lines product
        where product.settlement_id = settlement.id
      ), 0),
      2
    ) as gross_production
  from public.employee_settlements settlement
  where settlement.status in ('draft', 'review', 'approved')
)
update public.employee_settlements settlement
set
  gross_production_total = gross.gross_production,
  mandatory_discount_base_amount = case
    when coalesce(settlement.mandatory_discount_enabled_snapshot, true)
      then gross.gross_production
    else 0
  end
from gross
where settlement.id = gross.id;

update public.financial_postings posting
set
  amount = round(greatest(
    coalesce(settlement.gross_pay_amount, 0)
    + coalesce(settlement.manual_bonus_total, 0)
    - coalesce(settlement.other_deduction_total, 0)
    - coalesce(settlement.mandatory_discount_amount, 0),
    0
  ), 2),
  metadata = coalesce(posting.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'grossPay', settlement.gross_pay_amount,
      'mandatoryDiscount', settlement.mandatory_discount_amount,
      'debtRecoveries', settlement.debt_deduction_total,
      'grossProduction', settlement.gross_production_total
    )
from public.employee_settlements settlement
where posting.source_type = 'employee_settlement'
  and posting.source_id = settlement.id
  and posting.posting_code = 'approved_settlement_personnel_cost'
  and posting.status = 'posted'
  and settlement.status = 'approved';

notify pgrst, 'reload schema';

commit;
