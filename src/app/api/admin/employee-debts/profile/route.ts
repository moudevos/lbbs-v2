import { NextResponse } from "next/server";

import { requireTeamBranchSession } from "@/lib/supabase/route-auth";
import { createClient } from "@/lib/supabase/server";

const activeStatuses = ["pending", "partial"];
const recoveryTypes = [
  "settlement_deduction",
  "manual_payment",
  "immediate_payment",
  "write_off",
  "cancellation",
];

export async function GET(request: Request) {
  const auth = await requireTeamBranchSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const params = new URL(request.url).searchParams;
  const employeeId = params.get("employeeId")?.trim() ?? "";
  const requestedBranchId = params.get("branchId")?.trim() ?? "";
  const branchId = auth.role === "reception" ? auth.branchId ?? "" : requestedBranchId;
  if (!employeeId || !branchId) {
    return NextResponse.json(
      { error: "Empleado y sede son obligatorios para consultar el perfil." },
      { status: 400 },
    );
  }
  if (auth.role === "reception" && requestedBranchId && requestedBranchId !== branchId) {
    return NextResponse.json({ error: "No tienes acceso a esta sede." }, { status: 403 });
  }

  const supabase = await createClient();
  const debtsResult = await supabase
    .from("employee_debts")
    .select(
      "id,employee_id,branch_id,debt_type,original_amount,outstanding_amount,principal_amount,interest_rate_percent,interest_amount,status,description,created_at,settled_at,employee:employees!employee_debts_employee_id_fkey(id,full_name,document_number),branch:branches(id,name)",
    )
    .eq("employee_id", employeeId)
    .eq("branch_id", branchId)
    .order("created_at", { ascending: false });
  if (debtsResult.error) {
    console.error("[employee-debts/profile] No se pudieron cargar deudas", {
      code: debtsResult.error.code,
      message: debtsResult.error.message,
      details: debtsResult.error.details,
      hint: debtsResult.error.hint,
      employeeId,
      branchId,
    });
    return NextResponse.json({ error: "No se pudo cargar el perfil de deuda." }, { status: 500 });
  }

  const debts = debtsResult.data ?? [];
  if (debts.length === 0) {
    return NextResponse.json({ error: "No existe cuenta corriente para este empleado en la sede." }, { status: 404 });
  }
  const debtIds = debts.map((debt) => debt.id);
  const [ledgerResult, disbursementsResult, sourcesResult] = await Promise.all([
    supabase
      .from("vw_employee_debt_ledger")
      .select("employee_id,branch_id,debt_id,event_date,event_type,source_type,source_id,description,reference,signed_amount")
      .eq("employee_id", employeeId)
      .eq("branch_id", branchId)
      .order("event_date", { ascending: false }),
    supabase
      .from("employee_debt_disbursements")
      .select("id,debt_id,amount,payment_reference,evidence_url,notes,cash_context,reconciliation_status,created_at,payment_method:payment_methods(name)")
      .in("debt_id", debtIds)
      .order("created_at", { ascending: false }),
    supabase
      .from("vw_employee_debt_source_detail")
      .select("debt_id,debt_type,debt_description,sale_reference,first_item_description,extra_item_count,source_description")
      .in("debt_id", debtIds),
  ]);
  const error = ledgerResult.error ?? disbursementsResult.error ?? sourcesResult.error;
  if (error) {
    console.error("[employee-debts/profile] No se pudo cargar historial", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      employeeId,
      branchId,
    });
    return NextResponse.json({ error: "No se pudo cargar el historial completo." }, { status: 500 });
  }

  const sourceByDebt = new Map((sourcesResult.data ?? []).map((source) => [source.debt_id, source]));
  const ledger = (ledgerResult.data ?? []).map((event) => {
    const source = sourceByDebt.get(event.debt_id);
    const isPos = source?.debt_type === "internal_credit" || source?.debt_type === "supply";
    const sourceDescription = isPos
      ? source?.first_item_description ?? source?.source_description ?? event.description
      : source?.debt_description ?? event.description;
    const saleDetail = source?.sale_reference ? ` · Venta ${source.sale_reference}` : "";
    const extraDetail = Number(source?.extra_item_count ?? 0) > 0 ? ` · + ${source?.extra_item_count} items más` : "";
    return {
      ...event,
      event_type: event.event_type === "charge" ? source?.debt_type ?? event.event_type : event.event_type,
      description: `${sourceDescription}${extraDetail}${saleDetail}`,
      debt_source: source ?? null,
    };
  });
  const activeDebts = debts.filter((debt) => activeStatuses.includes(debt.status));
  const employee = Array.isArray(debts[0].employee) ? debts[0].employee[0] : debts[0].employee;
  const branch = Array.isArray(debts[0].branch) ? debts[0].branch[0] : debts[0].branch;
  const recoveredTotal = ledger
    .filter((event) => Number(event.signed_amount) < 0 || recoveryTypes.includes(event.event_type))
    .reduce((total, event) => total + Math.abs(Number(event.signed_amount)), 0);

  return NextResponse.json({
    summary: {
      employee,
      branch,
      activeOutstandingTotal: activeDebts.reduce((total, debt) => total + Number(debt.outstanding_amount), 0),
      activeDebtCount: activeDebts.length,
      originalActiveTotal: activeDebts.reduce((total, debt) => total + Number(debt.original_amount), 0),
      recoveredTotal,
      lastDebt: debts[0],
      lastMovement: ledger[0] ?? null,
    },
    debts,
    ledger,
    disbursements: disbursementsResult.data ?? [],
  });
}
