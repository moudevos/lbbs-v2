-- ============================================================================
-- DEV/QA ONLY — NO EJECUTAR EN PRODUCCIÓN.
--
-- RESET_PAYMENT_ONLY para una liquidación QA pagada por el flujo actual
-- pay_employee_settlement_v194. Devuelve paid -> approved y conserva todos los
-- snapshots, líneas y reservas de la liquidación para volver a probar Pagar.
--
-- No es una migración, RPC, endpoint ni capacidad de la aplicación. Ejecutar
-- manualmente solo en una base local/QA y cambiar explícitamente ambas variables
-- de seguridad antes de usarlo.
-- ============================================================================

begin;

create temporary table qa_reset_single_paid_settlement_result (
  settlement_id uuid primary key,
  payment_parts_removed integer not null default 0,
  debt_movements_reverted integer not null default 0,
  payment_postings_reverted integer not null default 0,
  cash_movements_reverted integer not null default 0
) on commit drop;

create temporary table qa_reset_single_paid_settlement_cash (
  cash_movement_id uuid primary key,
  pos_session_id uuid not null
) on commit drop;

do $$
declare
  -- Reemplazar el placeholder por el UUID de UNA liquidación QA pagada.
  v_settlement_id uuid := 'PEGAR_UUID_AQUI';
  -- Debe cambiarse manualmente a true incluso si el empleado tiene marcador QA.
  v_confirm_qa boolean := false;
  v_settlement public.employee_settlements%rowtype;
  v_employee_name text;
  v_payment public.employee_settlement_payments%rowtype;
  v_cash public.cash_movements%rowtype;
  v_debt public.employee_debts%rowtype;
  v_consumption record;
  v_restored_outstanding numeric(12,2);
  v_payment_parts_removed integer := 0;
  v_debt_movements_reverted integer := 0;
  v_cash_movements_reverted integer := 0;
begin
  if not v_confirm_qa then
    raise exception 'RESET QA BLOQUEADO: cambia v_confirm_qa a true solo para una liquidación QA/local verificada.';
  end if;

  select settlement.*
    into v_settlement
  from public.employee_settlements settlement
  where settlement.id = v_settlement_id
  for update;

  if not found then
    raise exception 'RESET QA BLOQUEADO: la liquidación % no existe.', v_settlement_id;
  end if;
  if v_settlement.status <> 'paid' then
    raise exception 'RESET QA BLOQUEADO: la liquidación % tiene estado %, se requiere paid.', v_settlement.settlement_number, v_settlement.status;
  end if;
  select full_name into v_employee_name
  from public.employees
  where id = v_settlement.employee_id;
  if v_employee_name not like 'QA_E2E_%'
     and v_employee_name not like 'QA_RUN_%'
     and v_employee_name not like 'QA_TEST_DATA %' then
    raise exception 'RESET QA BLOQUEADO: el empleado "%" no tiene un marcador QA permitido.', v_employee_name;
  end if;

  if not exists (
    select 1
    from public.financial_postings posting
    where posting.source_type = 'employee_settlement'
      and posting.source_id = v_settlement.id
      and posting.posting_code = 'approved_settlement_personnel_cost'
      and posting.status = 'posted'
  ) then
    raise exception 'RESET QA BLOQUEADO: falta el posting de aprobación esperado; no se creará uno durante el reset.';
  end if;

  -- v194 no genera finance_manual_entries ni postings de pago. El posting
  -- approved_settlement_personnel_cost pertenece a la aprobación y se conserva.
  -- Si la fila proviene de un flujo legacy o futuro, abortar en vez de borrar un
  -- hecho financiero cuyo contrato no haya sido auditado por este script.
  if exists (
    select 1
    from public.finance_manual_entries entry
    where entry.source_type = 'employee_settlement'
      and entry.source_id = v_settlement.id
      and entry.status = 'active'
  ) then
    raise exception 'RESET QA BLOQUEADO: la liquidación tiene un finance_manual_entry legado; este script solo soporta pagos v194.';
  end if;
  if exists (
    select 1
    from public.financial_postings posting
    join public.employee_settlement_payments payment on payment.id = posting.source_id
    where payment.settlement_id = v_settlement.id
      and posting.source_type = 'employee_settlement_payment'
      and posting.status = 'posted'
  ) then
    raise exception 'RESET QA BLOQUEADO: hay postings de pago no esperados por v194; revísalos antes de resetear.';
  end if;

  if exists (
    select 1 from public.employee_settlement_payments
    where settlement_id = v_settlement.id and status <> 'posted'
  ) then
    raise exception 'RESET QA BLOQUEADO: solo se admiten payment parts posted del flujo v194.';
  end if;
  if not exists (
    select 1 from public.employee_settlement_payments
    where settlement_id = v_settlement.id and status = 'posted'
  ) then
    raise exception 'RESET QA BLOQUEADO: la liquidación paid no tiene payment parts posted del flujo v194.';
  end if;

  -- Validar primero todos los movimientos físicos. Un pago en efectivo de una
  -- sesión ya cerrada no se modifica: el rollback completo deja todo intacto.
  for v_payment in
    select * from public.employee_settlement_payments
    where settlement_id = v_settlement.id and status = 'posted'
    order by created_at, id
    for update
  loop
    if v_payment.cash_movement_id is null then
      continue;
    end if;

    select * into v_cash
    from public.cash_movements
    where id = v_payment.cash_movement_id
    for update;
    if not found
       or v_cash.status <> 'active'
       or v_cash.source_type <> 'employee_settlement_payment'
       or v_cash.source_id <> v_payment.id then
      raise exception 'RESET QA BLOQUEADO: cash movement inválido para payment part %.', v_payment.id;
    end if;
    if not exists (
      select 1 from public.pos_sessions
      where id = v_cash.pos_session_id and status = 'open'
    ) then
      raise exception 'RESET QA BLOQUEADO: el pago % afectó una sesión POS cerrada (%). Abre una sesión QA nueva y no fuerces este reset.', v_payment.id, v_cash.pos_session_id;
    end if;
    if exists (
      select 1 from public.cash_movement_applications
      where cash_movement_id = v_cash.id
    ) then
      raise exception 'RESET QA BLOQUEADO: cash movement % tiene aplicaciones y no corresponde al pago v194 aislado.', v_cash.id;
    end if;

    insert into qa_reset_single_paid_settlement_cash(cash_movement_id, pos_session_id)
    values (v_cash.id, v_cash.pos_session_id)
    on conflict (cash_movement_id) do nothing;
  end loop;

  -- Un movimiento settlement_deduction es el único hecho que consumió cada
  -- deuda. Restaurar exactamente su amount y no tocar otros pagos o deudas.
  if exists (
    select 1
    from public.employee_debt_movements movement
    left join public.employee_settlement_deductions deduction
      on deduction.settlement_id = v_settlement.id
     and deduction.employee_debt_id = movement.debt_id
    where movement.settlement_id = v_settlement.id
      and movement.movement_type = 'settlement_deduction'
      and deduction.id is null
  ) then
    raise exception 'RESET QA BLOQUEADO: existe un debt movement sin deduction relacionada.';
  end if;
  if exists (
    select 1
    from public.employee_settlement_deductions deduction
    left join public.employee_debt_movements movement
      on movement.settlement_id = deduction.settlement_id
     and movement.debt_id = deduction.employee_debt_id
     and movement.movement_type = 'settlement_deduction'
    where deduction.settlement_id = v_settlement.id
    group by deduction.id
    having count(movement.id) <> 1
  ) then
    raise exception 'RESET QA BLOQUEADO: cada deduction debe tener exactamente un debt movement de esta liquidación.';
  end if;

  for v_consumption in
    select deduction.id as deduction_id,
           deduction.employee_debt_id,
           deduction.amount as deduction_amount,
           movement.id as movement_id,
           movement.amount as movement_amount
    from public.employee_settlement_deductions deduction
    join public.employee_debt_movements movement
      on movement.settlement_id = deduction.settlement_id
     and movement.debt_id = deduction.employee_debt_id
     and movement.movement_type = 'settlement_deduction'
    where deduction.settlement_id = v_settlement.id
    order by deduction.id
    for update of deduction, movement
  loop
    if round(v_consumption.deduction_amount, 2) <> round(v_consumption.movement_amount, 2) then
      raise exception 'RESET QA BLOQUEADO: deduction % y debt movement % no coinciden.', v_consumption.deduction_id, v_consumption.movement_id;
    end if;

    select * into v_debt
    from public.employee_debts
    where id = v_consumption.employee_debt_id
    for update;
    if not found or v_debt.status not in ('paid', 'partial') then
      raise exception 'RESET QA BLOQUEADO: deuda % no está en un estado restaurable.', v_consumption.employee_debt_id;
    end if;

    v_restored_outstanding := round(v_debt.outstanding_amount + v_consumption.movement_amount, 2);
    if v_restored_outstanding > v_debt.original_amount then
      raise exception 'RESET QA BLOQUEADO: restaurar deuda % excedería su saldo original; hay actividad posterior o datos inconsistentes.', v_debt.id;
    end if;

    update public.employee_debts
    set outstanding_amount = v_restored_outstanding,
        status = case when v_restored_outstanding = v_debt.original_amount then 'pending' else 'partial' end,
        settled_at = null
    where id = v_debt.id;

    delete from public.employee_debt_movements
    where id = v_consumption.movement_id
      and settlement_id = v_settlement.id
      and movement_type = 'settlement_deduction';
    v_debt_movements_reverted := v_debt_movements_reverted + 1;
  end loop;

  -- Liberar las FK antes de retirar las partes y sus salidas físicas. Las
  -- deductions se conservan: siguen siendo la reserva del documento approved.
  update public.employee_settlements
  set cash_movement_id = null
  where id = v_settlement.id;

  delete from public.employee_settlement_payments
  where settlement_id = v_settlement.id;
  get diagnostics v_payment_parts_removed = row_count;

  delete from public.cash_movements movement
  using qa_reset_single_paid_settlement_cash reset_cash
  where movement.id = reset_cash.cash_movement_id
    and movement.status = 'active'
    and movement.source_type = 'employee_settlement_payment';
  get diagnostics v_cash_movements_reverted = row_count;

  -- Cada sesión afectada sigue abierta y se recalcula después de eliminar solo
  -- la salida de este pago.
  perform public.sync_pos_session_totals(reset_cash.pos_session_id)
  from qa_reset_single_paid_settlement_cash reset_cash;

  update public.employee_settlements
  set status = 'approved',
      paid_by = null,
      paid_at = null,
      payment_method_id = null,
      payment_reference = null,
      payment_evidence_path = null,
      cash_movement_id = null
  where id = v_settlement.id;

  insert into qa_reset_single_paid_settlement_result(
    settlement_id, payment_parts_removed, debt_movements_reverted,
    payment_postings_reverted, cash_movements_reverted
  ) values (
    v_settlement.id, v_payment_parts_removed, v_debt_movements_reverted,
    0, v_cash_movements_reverted
  );
end;
$$;

-- Control final. payment_postings_reverted debe ser 0 en v194: el costo de
-- personal se genera al aprobar y por eso se conserva al volver a approved.
select
  settlement.id as settlement_id,
  settlement.settlement_number,
  settlement.status,
  settlement.net_pay_amount,
  result.payment_parts_removed,
  result.debt_movements_reverted,
  result.payment_postings_reverted,
  (result.cash_movements_reverted > 0) as cash_movement_reverted,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'debt_id', debt.id,
        'outstanding_amount', debt.outstanding_amount,
        'status', debt.status
      ) order by debt.id
    ) filter (where debt.id is not null),
    '[]'::jsonb
  ) as involved_debt_balances
from public.employee_settlements settlement
join qa_reset_single_paid_settlement_result result
  on result.settlement_id = settlement.id
left join public.employee_settlement_deductions deduction
  on deduction.settlement_id = settlement.id
left join public.employee_debts debt
  on debt.id = deduction.employee_debt_id
group by settlement.id, settlement.settlement_number, settlement.status,
         settlement.net_pay_amount, result.payment_parts_removed,
         result.debt_movements_reverted, result.payment_postings_reverted,
         result.cash_movements_reverted;

commit;

-- RESET_SETTLEMENT_COMPLETELY no está implementado deliberadamente. Requeriría
-- liberar reservas y eliminar el documento QA completo; este archivo implementa
-- solo RESET_PAYMENT_ONLY para volver a probar el paso Pagar.
