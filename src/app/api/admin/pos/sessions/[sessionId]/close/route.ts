import { NextResponse } from "next/server";

import { mapPosErrorMessage, parseMoney, trimOrNull } from "@/app/api/admin/pos/route-helpers";
import type { PosSessionCloseSummary } from "@/features/pos/pos-types";
import { createClient } from "@/lib/supabase/server";
import { requirePosWriteSession } from "@/lib/supabase/route-auth";

type JsonRecord = Record<string, unknown>;

function money(value: unknown) {
  const parsed = parseMoney(value);
  return parsed === null ? 0 : Number(parsed.toFixed(2));
}

function mapSummary(raw: JsonRecord): PosSessionCloseSummary {
  const closures = Array.isArray(raw.closures) ? raw.closures as JsonRecord[] : [];
  const closureByMethod = new Map(
    closures.map((item) => [String(item.payment_method_id), item]),
  );

  return {
    sessionId: String(raw.session_id),
    status: raw.status as PosSessionCloseSummary["status"],
    isOverdue: Boolean(raw.is_overdue),
    businessDate: String(raw.business_date),
    branchId: String(raw.branch_id),
    branchName: String(raw.branch_name ?? "Sin sede"),
    openedAt: String(raw.opened_at),
    openedByName: raw.opened_by_name ? String(raw.opened_by_name) : null,
    openingCashAmount: money(raw.opening_cash_amount),
    openingNotes: raw.opening_notes ? String(raw.opening_notes) : null,
    grossTotal: money(raw.gross_total),
    discountTotal: money(raw.discount_total),
    manualDiscountTotal: money(raw.manual_discount_total),
    rewardTotal: money(raw.reward_total),
    courtesyTotal: money(raw.courtesy_total),
    netTotal: money(raw.net_total),
    completedSalesCount: Number(raw.completed_sales_count ?? 0),
    cancelledSalesCount: Number(raw.cancelled_sales_count ?? 0),
    draftSalesCount: Number(raw.draft_sales_count ?? 0),
    paymentMethods: (Array.isArray(raw.payment_methods) ? raw.payment_methods : []).map(
      (item: JsonRecord) => {
        const paymentMethodId = String(item.payment_method_id);
        const closure = closureByMethod.get(paymentMethodId);
        return {
          paymentMethodId,
          code: String(item.code ?? ""),
          name: String(item.name ?? "Metodo"),
          isActive: Boolean(item.is_active),
          expectedAmount: money(item.expected_amount),
          countedAmount: closure ? money(closure.counted_amount) : null,
          differenceAmount: closure ? money(closure.difference_amount) : null,
        };
      },
    ),
    movements: (Array.isArray(raw.movements) ? raw.movements : []).map(
      (item: JsonRecord) => ({
        id: String(item.id),
        movementType: item.movement_type as "income" | "expense" | "adjustment",
        categoryName: String(item.category_name ?? "Movimiento"),
        amount: money(item.amount),
        description: String(item.description ?? ""),
        status: String(item.status ?? "active"),
        createdAt: String(item.created_at),
      }),
    ),
    rewards: (Array.isArray(raw.rewards) ? raw.rewards : []).map(
      (item: JsonRecord) => ({
        id: String(item.id),
        saleId: String(item.sale_id),
        saleReference: String(item.sale_reference),
        customerName: String(item.customer_name ?? "Cliente"),
        rewardName: String(item.reward_name ?? "Reward"),
        discountAmount: money(item.discount_amount),
        appliedAt: String(item.applied_at),
      }),
    ),
    sales: (Array.isArray(raw.sales) ? raw.sales : []).map((item: JsonRecord) => ({
      id: String(item.id),
      reference: String(item.reference),
      status: item.status as "draft" | "completed" | "cancelled",
      customerName: String(item.customer_name ?? "Cliente varios"),
      subtotal: money(item.subtotal),
      discountTotal: money(item.discount_total),
      courtesyTotal: money(item.courtesy_total),
      total: money(item.total),
      createdAt: String(item.created_at),
      closedAt: item.closed_at ? String(item.closed_at) : null,
    })),
    closingNotes: raw.closing_notes ? String(raw.closing_notes) : null,
    closedAt: raw.closed_at ? String(raw.closed_at) : null,
    closedByName: raw.closed_by_name ? String(raw.closed_by_name) : null,
  };
}

async function loadSessionCloseSummary(sessionId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_pos_session_closure_summary", {
    p_session_id: sessionId,
  });

  if (error || !data) {
    throw new Error(error?.message ?? "No se pudo cargar el resumen de cierre.");
  }

  return mapSummary(data as JsonRecord);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const auth = await requirePosWriteSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { sessionId } = await context.params;
  try {
    return NextResponse.json({ data: await loadSessionCloseSummary(sessionId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    console.error("[pos/cierre] Error al cargar el resumen", { sessionId, message });
    return NextResponse.json({ error: mapPosErrorMessage(message) }, { status: 400 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const auth = await requirePosWriteSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { sessionId } = await context.params;
  const payload = await request.json().catch(() => null);
  const rawAmounts = payload?.counted_amounts;

  if (!rawAmounts || typeof rawAmounts !== "object" || Array.isArray(rawAmounts)) {
    return NextResponse.json(
      { error: "Ingresa los montos reales de todos los metodos." },
      { status: 400 },
    );
  }

  const countedAmounts: Record<string, number> = {};
  for (const [methodId, rawValue] of Object.entries(rawAmounts as Record<string, unknown>)) {
    const value = parseMoney(rawValue);
    if (value === null || value < 0) {
      return NextResponse.json(
        { error: "Todos los montos reales deben ser validos." },
        { status: 400 },
      );
    }
    countedAmounts[methodId] = Number(value.toFixed(2));
  }

  const supabase = await createClient();
  try {
    const { data, error } = await supabase.rpc("close_pos_session", {
      p_session_id: sessionId,
      p_counted_amounts: countedAmounts,
      p_notes: trimOrNull(payload?.notes),
    });

    if (error || !data) {
      throw new Error(error?.message ?? "No se pudo cerrar la sesion POS.");
    }

    return NextResponse.json({ data: mapSummary(data as JsonRecord) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    console.error("[pos/cierre] Error al cerrar la sesion", { sessionId, message });
    return NextResponse.json({ error: mapPosErrorMessage(message) }, { status: 400 });
  }
}
