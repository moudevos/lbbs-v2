import { NextResponse } from "next/server";

import { getCashMovementAvailableAmount } from "@/features/cash/cash-movement-applications";
import { createClient } from "@/lib/supabase/server";
import { requireTeamBranchSession } from "@/lib/supabase/route-auth";

type CashMovementRow = {
  id: string;
  pos_session_id: string;
  branch_id: string;
  created_at: string;
  description: string;
  amount: number | string;
};

type ApplicationRow = {
  cash_movement_id: string;
  amount: number | string;
};

export async function GET(request: Request) {
  const auth = await requireTeamBranchSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const requestedBranchId = new URL(request.url).searchParams.get("branchId")?.trim() ?? "";
  const branchId = auth.role === "reception" ? (auth.branchId ?? "") : requestedBranchId;
  if (!branchId) return NextResponse.json({ error: "Selecciona una sede para consultar salidas POS." }, { status: 400 });
  if (auth.role === "reception" && requestedBranchId && requestedBranchId !== branchId) {
    return NextResponse.json({ error: "No tienes acceso a esta sede." }, { status: 403 });
  }

  const supabase = await createClient();
  const movements = await supabase
    .from("cash_movements")
    .select("id,pos_session_id,branch_id,created_at,description,amount,category:cash_movement_categories!inner(code)")
    .eq("branch_id", branchId)
    .eq("status", "active")
    .eq("movement_type", "expense")
    .eq("category.code", "cash_withdrawal")
    .order("created_at", { ascending: false });
  if (movements.error) {
    console.error("[employee-debts/pos-withdrawals] No se pudieron cargar retiros", { message: movements.error.message, code: movements.error.code });
    return NextResponse.json({ error: "No se pudieron cargar las salidas POS disponibles." }, { status: 500 });
  }

  const rows = (movements.data ?? []) as CashMovementRow[];
  const ids = rows.map((row) => row.id);
  const applications = ids.length
    ? await supabase.from("cash_movement_applications").select("cash_movement_id,amount").in("cash_movement_id", ids)
    : { data: [], error: null };
  if (applications.error) {
    console.error("[employee-debts/pos-withdrawals] No se pudieron cargar aplicaciones", { message: applications.error.message, code: applications.error.code });
    return NextResponse.json({ error: "No se pudo calcular el disponible de las salidas POS." }, { status: 500 });
  }

  const appliedByMovement = new Map<string, number>();
  for (const application of (applications.data ?? []) as ApplicationRow[]) {
    appliedByMovement.set(
      application.cash_movement_id,
      (appliedByMovement.get(application.cash_movement_id) ?? 0) + Number(application.amount),
    );
  }
  const withdrawals = rows.map((movement) => {
    const amount = Number(movement.amount);
    const appliedAmount = appliedByMovement.get(movement.id) ?? 0;
    return {
      id: movement.id,
      pos_session_id: movement.pos_session_id,
      branch_id: movement.branch_id,
      created_at: movement.created_at,
      description: movement.description,
      amount,
      applied_amount: appliedAmount,
      available_amount: getCashMovementAvailableAmount(amount, appliedAmount),
    };
  }).filter((movement) => movement.available_amount > 0);

  return NextResponse.json({ withdrawals });
}
