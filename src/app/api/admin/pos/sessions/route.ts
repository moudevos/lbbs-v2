import { NextResponse } from "next/server";

import { toMoneyNumber } from "@/app/api/admin/pos/route-helpers";
import { createClient } from "@/lib/supabase/server";
import { requirePosWriteSession } from "@/lib/supabase/route-auth";

type Relation = { name: string | null }[] | { name: string | null } | null;
type SessionRow = {
  id: string;
  branch_id: string;
  business_date: string;
  status: "open" | "pending_close" | "closed" | "cancelled";
  opening_cash_amount: number | string;
  total_sales_amount: number | string;
  expected_cash_amount: number | string;
  counted_cash_amount: number | string | null;
  opened_at: string;
  closed_at: string | null;
  branch: Relation;
  opened_by_employee: Relation;
  closed_by_employee: Relation;
  payment_closures: Array<{ difference_amount: number | string }> | null;
};

function relationName(value: Relation) {
  const relation = Array.isArray(value) ? value[0] : value;
  return relation?.name ?? null;
}

export async function GET(request: Request) {
  const auth = await requirePosWriteSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const supabase = await createClient();
  await supabase.rpc("mark_overdue_pos_sessions");
  const { data: businessDate } = await supabase.rpc("pos_business_date");

  const { searchParams } = new URL(request.url);
  const branchId = searchParams.get("branchId")?.trim();
  const status = searchParams.get("status")?.trim();
  const date = searchParams.get("date")?.trim();

  let query = supabase
    .from("pos_sessions")
    .select(
      "id, branch_id, business_date, status, opening_cash_amount, total_sales_amount, expected_cash_amount, counted_cash_amount, opened_at, closed_at, branch:branches(name), opened_by_employee:employees!pos_sessions_opened_by_fkey(name:full_name), closed_by_employee:employees!pos_sessions_closed_by_fkey(name:full_name), payment_closures:pos_session_payment_closures(difference_amount)",
    )
    .order("opened_at", { ascending: false })
    .limit(200);

  if (branchId) query = query.eq("branch_id", branchId);
  if (status) query = query.eq("status", status);
  if (date) query = query.eq("business_date", date);

  const { data, error } = await query;
  if (error) {
    console.error("[pos/historial] Error al listar sesiones", {
      message: error.message,
      code: error.code,
    });
    return NextResponse.json(
      { error: "No se pudo cargar el historial de sesiones." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    data: ((data ?? []) as SessionRow[]).map((session) => ({
      id: session.id,
      businessDate: session.business_date,
      branchId: session.branch_id,
      branchName: relationName(session.branch) ?? "Sin sede",
      openedAt: session.opened_at,
      openedByName: relationName(session.opened_by_employee),
      closedAt: session.closed_at,
      closedByName: relationName(session.closed_by_employee),
      status: session.status,
      isOverdue:
        session.status === "pending_close" ||
        ((session.status === "open") && Boolean(businessDate) && session.business_date < businessDate),
      openingCashAmount: toMoneyNumber(session.opening_cash_amount),
      totalSalesAmount: toMoneyNumber(session.total_sales_amount),
      expectedCashAmount: toMoneyNumber(session.expected_cash_amount),
      countedCashAmount:
        session.counted_cash_amount === null
          ? null
          : toMoneyNumber(session.counted_cash_amount),
      totalDifferenceAmount: session.payment_closures?.length
        ? session.payment_closures.reduce(
            (total, item) => total + toMoneyNumber(item.difference_amount),
            0,
          )
        : null,
    })),
  });
}
