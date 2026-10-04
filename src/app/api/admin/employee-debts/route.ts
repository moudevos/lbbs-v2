import { NextResponse } from "next/server";
import { enrichEmployeeDebtDisplay } from "@/lib/employee-debts/debt-display";
import { createClient } from "@/lib/supabase/server";
import { requireTeamBranchSession } from "@/lib/supabase/route-auth";

const openStatuses = ["pending", "partial"];

export async function GET(request: Request) {
  const auth = await requireTeamBranchSession();
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const params = new URL(request.url).searchParams;
  const requestedBranchId = params.get("branchId")?.trim() ?? "";
  const branchId =
    auth.role === "reception" ? (auth.branchId ?? "") : requestedBranchId;
  if (auth.role === "reception" && !branchId) {
    return NextResponse.json(
      { error: "La cuenta de recepción no tiene una sede asignada." },
      { status: 403 },
    );
  }
  const employeeId = params.get("employeeId")?.trim() ?? "";
  const status = params.get("status")?.trim() ?? "open";
  const supabase = await createClient();
  let query = supabase
    .from("employee_debts")
    .select(
      "id,employee_id,branch_id,debt_type,original_amount,outstanding_amount,principal_amount,interest_rate_percent,interest_amount,status,description,created_at,settled_at,employee:employees!employee_debts_employee_id_fkey(id,full_name,document_number),branch:branches(id,name)",
    )
    .order("created_at", { ascending: false });
  if (branchId) query = query.eq("branch_id", branchId);
  if (employeeId) query = query.eq("employee_id", employeeId);
  if (status === "open") query = query.in("status", openStatuses);
  else if (status !== "all") query = query.eq("status", status);
  let profilesQuery = supabase
    .from("vw_employee_debt_profiles")
    .select("employee_id,branch_id,employee_name,branch_name,outstanding_total,active_debt_count,last_movement_date,last_movement_type,last_movement_signed_amount")
    .order("employee_name");
  if (branchId) profilesQuery = profilesQuery.eq("branch_id", branchId);
  if (employeeId) profilesQuery = profilesQuery.eq("employee_id", employeeId);
  const [debts, employees, branches, paymentMethods, profilesResult] = await Promise.all([
    query,
    auth.role === "reception"
      ? supabase
          .from("employees")
          .select("id,full_name,document_number,branch_id")
          .eq("status", "active")
          .eq("branch_id", branchId)
          .order("full_name")
      : supabase
          .from("employees")
          .select("id,full_name,document_number,branch_id")
          .eq("status", "active")
          .order("full_name"),
    auth.role === "reception"
      ? supabase
          .from("branches")
          .select("id,name")
          .eq("is_active", true)
          .eq("id", branchId)
          .order("name")
      : supabase
          .from("branches")
          .select("id,name")
          .eq("is_active", true)
          .order("name"),
    supabase
      .from("payment_methods")
      .select("id,name,payment_kind")
      .eq("is_active", true)
      .neq("payment_kind", "internal_credit")
      .order("sort_order"),
    profilesQuery,
  ]);
  const error =
    debts.error ?? employees.error ?? branches.error ?? paymentMethods.error ?? profilesResult.error;
  if (error) {
    console.error("[employee-debts/get] Error", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return NextResponse.json(
      { error: "No se pudo cargar el mapa de deudas." },
      { status: 500 },
    );
  }
  const ids = (debts.data ?? []).map((item) => item.id);
  const movements = ids.length
    ? await supabase
        .from("employee_debt_movements")
        .select(
          "id,debt_id,movement_type,amount,payment_reference,notes,created_at,payment_method:payment_methods(name),settlement:employee_settlements(settlement_number)",
        )
        .in("debt_id", ids)
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (movements.error) {
    console.error("[employee-debts/get-movements] Error", {
      message: movements.error.message,
      code: movements.error.code,
      details: movements.error.details,
      hint: movements.error.hint,
    });
    return NextResponse.json(
      { error: "No se pudo cargar los movimientos de deuda." },
      { status: 500 },
    );
  }
  const enrichedDebts = await enrichEmployeeDebtDisplay(
    supabase,
    (debts.data ?? []) as Array<Record<string, unknown>>,
  );
  return NextResponse.json({
    debts: enrichedDebts,
    movements: movements.data ?? [],
    profiles: (profilesResult.data ?? []).filter((profile) => status !== "open" || Number(profile.active_debt_count) > 0),
    filters: {
      employees: employees.data ?? [],
      branches: branches.data ?? [],
      paymentMethods: paymentMethods.data ?? [],
    },
    permissions: {
      canRecordPayments: auth.role !== "reception",
      canCreatePenalty: auth.role !== "reception",
      canWaiveDebts: auth.role !== "reception",
    },
  });
}

export async function POST(request: Request) {
  const auth = await requireTeamBranchSession();
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const body = await request.json().catch(() => null);
  const supabase = await createClient();
  let result;
  if (body?.action === "create") {
    if (
      !body.employeeId ||
      !body.branchId ||
      !body.debtType ||
      !body.description ||
      Number(body.amount) <= 0
    )
      return NextResponse.json(
        {
          error: "Empleado, sede, tipo, monto y descripción son obligatorios.",
        },
        { status: 400 },
      );
    if (
      auth.role === "reception" &&
      (body.branchId !== auth.branchId ||
        !["loan", "advance"].includes(body.debtType))
    ) {
      return NextResponse.json(
        { error: "Recepción solo puede registrar deudas manuales de su sede." },
        { status: 403 },
      );
    }
    const manualTypes = ["loan", "advance", "penalty", "administrative_charge"];
    if (!manualTypes.includes(body.debtType)) {
      return NextResponse.json(
        { error: "Los insumos y créditos POS se originan en sus flujos operativos; no se registran manualmente." },
        { status: 400 },
      );
    }
    const interestRatePercent = Number(body.interestRatePercent ?? 0);
    if (["loan", "advance"].includes(body.debtType) && (!Number.isFinite(interestRatePercent) || interestRatePercent < 0)) {
      return NextResponse.json({ error: "El porcentaje de interés no puede ser negativo." }, { status: 400 });
    }
    if (body.debtType === "advance" && interestRatePercent !== 0) {
      return NextResponse.json({ error: "Los adelantos no admiten interés." }, { status: 400 });
    }
    result = await supabase.rpc(body.debtType === "loan" || body.debtType === "advance" ? "create_employee_debt_with_disbursements_v2" : "create_employee_debt_with_disbursements", {
      p_employee_id: body.employeeId,
      p_branch_id: body.branchId,
      p_debt_type: body.debtType,
      ...(body.debtType === "loan" || body.debtType === "advance"
        ? { p_principal_amount: Number(body.amount), p_interest_rate_percent: interestRatePercent }
        : { p_amount: Number(body.amount) }),
      p_description: body.description,
      p_disbursements: body.debtType === "loan" || body.debtType === "advance"
        ? body.disbursements ?? []
        : [],
    });
  } else if (body?.action === "createFromPosCash") {
    if (
      !body.employeeId ||
      !body.branchId ||
      !["loan", "advance"].includes(body.debtType) ||
      !body.description ||
      !body.cashMovementId ||
      Number(body.amount) <= 0
    ) {
      return NextResponse.json({ error: "Empleado, sede, tipo, salida POS, monto y descripción son obligatorios." }, { status: 400 });
    }
    if (auth.role === "reception" && body.branchId !== auth.branchId) {
      return NextResponse.json({ error: "Recepción solo puede registrar deudas de su sede." }, { status: 403 });
    }
    const interestRatePercent = Number(body.interestRatePercent ?? 0);
    if (!Number.isFinite(interestRatePercent) || interestRatePercent < 0) {
      return NextResponse.json({ error: "El porcentaje de interés no puede ser negativo." }, { status: 400 });
    }
    if (body.debtType === "advance" && interestRatePercent !== 0) {
      return NextResponse.json({ error: "Los adelantos no admiten interés." }, { status: 400 });
    }
    result = await supabase.rpc("create_employee_debt_from_pos_cash_v2", {
      p_employee_id: body.employeeId,
      p_branch_id: body.branchId,
      p_debt_type: body.debtType,
      p_principal_amount: Number(body.amount),
      p_interest_rate_percent: interestRatePercent,
      p_description: body.description,
      p_cash_movement_id: body.cashMovementId,
    });
  } else if (body?.action === "payment") {
    if (auth.role === "reception")
      return NextResponse.json(
        { error: "Recepción no puede registrar pagos de deuda." },
        { status: 403 },
      );
    if (!body.debtId || Number(body.amount) <= 0)
      return NextResponse.json(
        { error: "Selecciona una deuda e indica un pago válido." },
        { status: 400 },
      );
    result = await supabase.rpc("collect_employee_debt_v188", {
      p_debt_id: body.debtId,
      p_amount: Number(body.amount),
      p_notes: body.notes || null,
      p_payment_method_id: body.paymentMethodId || null,
      p_reference: body.reference || null,
    });
  } else if (body?.action === "waivePenalty") {
    if (auth.role === "reception") return NextResponse.json({ error: "Recepción no puede dejar penalidades sin efecto." }, { status: 403 });
    result = await supabase.rpc("waive_employee_penalty_v188", {
      p_debt_id: body.debtId,
      p_reason_code: body.reasonCode,
      p_note: body.note || null,
    });
  } else if (body?.action === "waive") {
    if (auth.role === "reception")
      return NextResponse.json(
        { error: "Recepción no puede dejar deudas sin efecto." },
        { status: 403 },
      );
    if (!body.debtId || !String(body.reason ?? "").trim())
      return NextResponse.json(
        { error: "Selecciona una deuda e indica el motivo obligatorio." },
        { status: 400 },
      );
    result = await supabase.rpc("waive_employee_debt", {
      p_debt_id: body.debtId,
      p_reason: String(body.reason).trim(),
    });
  } else
    return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
  if (result.error)
    return NextResponse.json(
      { error: result.error.message || "No se pudo registrar la operación." },
      { status: 400 },
    );
  return NextResponse.json({ data: result.data });
}
