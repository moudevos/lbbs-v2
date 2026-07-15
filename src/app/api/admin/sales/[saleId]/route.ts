import { NextResponse } from "next/server";

import {
  formatSaleReference,
  mapPosErrorMessage,
  toMoneyNumber,
} from "@/app/api/admin/pos/route-helpers";
import { createClient } from "@/lib/supabase/server";
import { requirePosWriteSession } from "@/lib/supabase/route-auth";

type SaleDetailRow = {
  id: string;
  reservation_id: string | null;
  status: "draft" | "completed" | "cancelled";
  subtotal: number | string;
  discount_total: number | string;
  courtesy_total: number | string;
  total: number | string;
  paid_total: number | string;
  change_amount: number | string;
  created_at: string;
  closed_at: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  pos_session_id: string;
  customer?: { full_name: string | null }[] | { full_name: string | null } | null;
  branch?: { name: string | null }[] | { name: string | null } | null;
  barber?: { full_name: string | null }[] | { full_name: string | null } | null;
  closed_by_employee?: { full_name: string | null }[] | { full_name: string | null } | null;
};

type SaleItemRow = {
  id: string;
  item_type: "service" | "product";
  description_snapshot: string;
  quantity: number | string;
  unit_price: number | string;
  discount_amount: number | string;
  total: number | string;
  is_courtesy: boolean;
  courtesy_reason: string | null;
  barber?: { full_name: string | null }[] | { full_name: string | null } | null;
};

type SalePaymentRow = {
  id: string;
  amount: number | string;
  tendered_amount: number | string | null;
  change_amount: number | string;
  reference: string | null;
  notes: string | null;
  payment_method?: { code: string | null; name: string | null }[] | { code: string | null; name: string | null } | null;
};

function unwrapRelation<T>(value: T[] | T | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ saleId: string }> },
) {
  const auth = await requirePosWriteSession();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { saleId } = await context.params;
  const supabase = await createClient();

  try {
    const [saleResult, itemsResult, paymentsResult] = await Promise.all([
      supabase
        .from("sales")
        .select(
          "id, reservation_id, status, subtotal, discount_total, courtesy_total, total, paid_total, change_amount, created_at, closed_at, cancelled_at, cancelled_reason, pos_session_id, customer:customers(full_name), branch:branches(name), barber:employees!sales_barber_id_fkey(full_name), closed_by_employee:employees!sales_closed_by_fkey(full_name)",
        )
        .eq("id", saleId)
        .maybeSingle(),
      supabase
        .from("sale_items")
        .select(
          "id, item_type, description_snapshot, quantity, unit_price, discount_amount, total, is_courtesy, courtesy_reason, barber:employees!sale_items_barber_id_fkey(full_name)",
        )
        .eq("sale_id", saleId)
        .order("created_at", { ascending: true }),
      supabase
        .from("sale_payments")
        .select(
          "id, amount, tendered_amount, change_amount, reference, notes, payment_method:payment_methods(code, name)",
        )
        .eq("sale_id", saleId)
        .order("created_at", { ascending: true }),
    ]);

    if (saleResult.error || itemsResult.error || paymentsResult.error) {
      throw new Error(
        saleResult.error?.message ||
          itemsResult.error?.message ||
          paymentsResult.error?.message ||
          "No se pudo cargar el detalle de la venta.",
      );
    }

    if (!saleResult.data) {
      return NextResponse.json({ error: "La venta no existe." }, { status: 404 });
    }

    const posSessionId = saleResult.data.pos_session_id;
    const { data: posSession, error: posSessionError } = posSessionId
      ? await supabase.from("pos_sessions").select("id, status").eq("id", posSessionId).maybeSingle()
      : { data: null, error: null };

    if (posSessionError) {
      throw new Error(posSessionError.message);
    }

    const sale = saleResult.data as SaleDetailRow;
    return NextResponse.json({
      data: {
        id: sale.id,
        saleReference: formatSaleReference(sale.id),
        status: sale.status,
        createdAt: sale.created_at,
        closedAt: sale.closed_at,
        cancelledAt: sale.cancelled_at,
        cancelledReason: sale.cancelled_reason,
        branchName: unwrapRelation(sale.branch)?.name ?? "Sin sede",
        customerName: unwrapRelation(sale.customer)?.full_name ?? "Cliente",
        barberName: unwrapRelation(sale.barber)?.full_name ?? null,
        reservationId: sale.reservation_id,
        subtotal: toMoneyNumber(sale.subtotal),
        discountTotal: toMoneyNumber(sale.discount_total),
        courtesyTotal: toMoneyNumber(sale.courtesy_total),
        total: toMoneyNumber(sale.total),
        paidTotal: toMoneyNumber(sale.paid_total),
        changeAmount: toMoneyNumber(sale.change_amount),
        closedByName: unwrapRelation(sale.closed_by_employee)?.full_name ?? null,
        canCancel: sale.status === "completed" && posSession?.status === "open",
        items: ((itemsResult.data ?? []) as SaleItemRow[]).map((item) => ({
          id: item.id,
          itemType: item.item_type,
          name: item.description_snapshot,
          quantity: toMoneyNumber(item.quantity),
          unitPrice: toMoneyNumber(item.unit_price),
          discountAmount: toMoneyNumber(item.discount_amount),
          total: toMoneyNumber(item.total),
          isCourtesy: item.is_courtesy,
          courtesyReason: item.courtesy_reason,
          barberName: unwrapRelation(item.barber)?.full_name ?? null,
        })),
        payments: ((paymentsResult.data ?? []) as SalePaymentRow[]).map((payment) => {
          const method = unwrapRelation(payment.payment_method);

          return {
            id: payment.id,
            paymentMethodCode: method?.code ?? "cash",
            paymentMethodName: method?.name ?? "Metodo",
            amount: toMoneyNumber(payment.amount),
            tenderedAmount:
              payment.tendered_amount === null
                ? toMoneyNumber(payment.amount)
                : toMoneyNumber(payment.tendered_amount),
            changeAmount: toMoneyNumber(payment.change_amount),
            reference: payment.reference,
            notes: payment.notes,
          };
        }),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    console.error("[sales/detail] Error al cargar detalle de venta", { saleId, message });
    return NextResponse.json(
      { error: mapPosErrorMessage(message) },
      { status: 400 },
    );
  }
}
