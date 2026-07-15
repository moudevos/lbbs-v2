import { NextResponse } from "next/server";

import {
  formatSaleReference,
  mapPosErrorMessage,
  toMoneyNumber,
  trimOrNull,
} from "@/app/api/admin/pos/route-helpers";
import { createClient } from "@/lib/supabase/server";
import { requirePosWriteSession } from "@/lib/supabase/route-auth";

type RecentSaleRow = {
  id: string;
  status: "draft" | "completed" | "cancelled";
  total: number | string;
  paid_total: number | string;
  change_amount: number | string;
  created_at: string;
  closed_at: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  customer?: { full_name: string | null }[] | { full_name: string | null } | null;
  barber?: { full_name: string | null }[] | { full_name: string | null } | null;
  payments?: Array<{payment_method?: {name:string|null}[] | {name:string|null} | null}> | null;
};

function unwrapRelation<T>(value: T[] | T | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export async function GET(request: Request) {
  const auth = await requirePosWriteSession();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const sessionId = trimOrNull(searchParams.get("sessionId"));

  if (!sessionId) {
    return NextResponse.json(
      { error: "Falta la sesion POS a consultar." },
      { status: 400 },
    );
  }

  try {
    const [sessionResult, salesResult] = await Promise.all([
      supabase.from("pos_sessions").select("id, status").eq("id", sessionId).maybeSingle(),
      supabase
        .from("sales")
        .select(
          "id, status, total, paid_total, change_amount, created_at, closed_at, cancelled_at, cancelled_reason, customer:customers(full_name), barber:employees!sales_barber_id_fkey(full_name), payments:sale_payments(payment_method:payment_methods(name))",
        )
        .eq("pos_session_id", sessionId)
        .in("status", ["completed", "cancelled"])
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    if (sessionResult.error) {
      throw new Error(sessionResult.error.message);
    }

    if (!sessionResult.data) {
      return NextResponse.json(
        { error: "La sesion POS ya no esta disponible." },
        { status: 404 },
      );
    }

    if (salesResult.error) {
      throw new Error(salesResult.error.message);
    }

    const canCancel = sessionResult.data.status === "open";
    const data = ((salesResult.data ?? []) as RecentSaleRow[]).map((sale) => ({
      id: sale.id,
      saleReference: formatSaleReference(sale.id),
      status: sale.status,
      customerName: unwrapRelation(sale.customer)?.full_name ?? "Cliente",
      barberName: unwrapRelation(sale.barber)?.full_name ?? null,
      total: toMoneyNumber(sale.total),
      paidTotal: toMoneyNumber(sale.paid_total),
      changeAmount: toMoneyNumber(sale.change_amount),
      createdAt: sale.created_at,
      closedAt: sale.closed_at,
      cancelledAt: sale.cancelled_at,
      cancelledReason: sale.cancelled_reason,
      canCancel: canCancel && sale.status === "completed",
      paymentMethodLabels: (sale.payments ?? []).map((payment) => unwrapRelation(payment.payment_method)?.name ?? "Metodo"),
    }));

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    console.error("[pos/ventas] Error al cargar ventas recientes", {
      sessionId,
      message,
    });
    return NextResponse.json(
      { error: mapPosErrorMessage(message) },
      { status: 400 },
    );
  }
}
