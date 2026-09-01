import { NextResponse } from "next/server";

import {
  formatSaleReference,
  mapPosErrorMessage,
  toMoneyNumber,
  trimOrNull,
} from "@/app/api/admin/pos/route-helpers";
import { createClient } from "@/lib/supabase/server";
import { requirePosWriteSession } from "@/lib/supabase/route-auth";

type SaleRow = {
  id: string;
  pos_session_id: string;
  branch_id: string;
  barber_id: string | null;
  status: "draft" | "completed" | "cancelled";
  total: number | string;
  paid_total: number | string;
  change_amount: number | string;
  courtesy_total: number | string;
  accounting_date: string;
  created_at: string;
  closed_at: string | null;
  customer?: { full_name: string | null }[] | { full_name: string | null } | null;
  branch?: { name: string | null }[] | { name: string | null } | null;
  barber?: { full_name: string | null }[] | { full_name: string | null } | null;
};

type SalePaymentRow = {
  sale_id: string;
  payment_method_id: string;
  payment_method?: { name: string | null }[] | { name: string | null } | null;
};

type SaleItemRow = {
  sale_id: string;
  item_type: "service" | "product";
  is_courtesy: boolean;
};

type OptionRow = {
  id: string;
  name?: string | null;
  full_name?: string | null;
  opened_at?: string | null;
  branch?: { name: string | null }[] | { name: string | null } | null;
};

function unwrapRelation<T>(value: T[] | T | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function formatSessionLabel(sessionId: string) {
  return `SES-${sessionId.slice(0, 8).toUpperCase()}`;
}

export async function GET(request: Request) {
  const auth = await requirePosWriteSession();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const dateFrom = trimOrNull(searchParams.get("dateFrom"));
  const dateTo = trimOrNull(searchParams.get("dateTo"));
  const branchId = trimOrNull(searchParams.get("branchId"));
  const status = trimOrNull(searchParams.get("status"));
  const customer = trimOrNull(searchParams.get("customer"))?.toLowerCase() ?? "";
  const barberId = trimOrNull(searchParams.get("barberId"));
  const paymentMethodId = trimOrNull(searchParams.get("paymentMethodId"));
  const posSessionId = trimOrNull(searchParams.get("posSessionId"));
  const itemType = trimOrNull(searchParams.get("itemType"));
  const courtesy = trimOrNull(searchParams.get("courtesy"));

  try {
    let salesQuery = supabase
      .from("sales")
      .select(
        "id, pos_session_id, branch_id, barber_id, status, total, paid_total, change_amount, courtesy_total, accounting_date, created_at, closed_at, customer:customers(full_name), branch:branches(name), barber:employees!sales_barber_id_fkey(full_name)",
      )
      .order("accounting_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);

    if (dateFrom) {
      salesQuery = salesQuery.gte("accounting_date", dateFrom);
    }

    if (dateTo) {
      salesQuery = salesQuery.lte("accounting_date", dateTo);
    }

    if (branchId) {
      salesQuery = salesQuery.eq("branch_id", branchId);
    }

    if (status) {
      salesQuery = salesQuery.eq("status", status);
    }

    if (barberId) {
      salesQuery = salesQuery.eq("barber_id", barberId);
    }

    if (posSessionId) {
      salesQuery = salesQuery.eq("pos_session_id", posSessionId);
    }

    const [salesResult, branchesResult, barbersResult, paymentMethodsResult, sessionsResult] =
      await Promise.all([
        salesQuery,
        supabase.from("branches").select("id, name").order("name", { ascending: true }),
        supabase
          .from("employees")
          .select("id, full_name")
          .eq("role", "barber")
          .eq("status", "active")
          .order("full_name", { ascending: true }),
        supabase
          .from("payment_methods")
          .select("id, name")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        supabase
          .from("pos_sessions")
          .select("id, opened_at, branch:branches(name)")
          .order("opened_at", { ascending: false })
          .limit(60),
      ]);

    if (
      salesResult.error ||
      branchesResult.error ||
      barbersResult.error ||
      paymentMethodsResult.error ||
      sessionsResult.error
    ) {
      throw new Error(
        salesResult.error?.message ||
          branchesResult.error?.message ||
          barbersResult.error?.message ||
          paymentMethodsResult.error?.message ||
          sessionsResult.error?.message ||
          "No se pudo cargar el historial de ventas.",
      );
    }

    const sales = (salesResult.data ?? []) as SaleRow[];
    const saleIds = sales.map((sale) => sale.id);
    const sessionIds = Array.from(new Set(sales.map((sale) => sale.pos_session_id)));

    const [paymentsResult, itemsResult, sessionStatusResult] = await Promise.all([
      saleIds.length
        ? supabase
            .from("sale_payments")
            .select("sale_id, payment_method_id, payment_method:payment_methods(name)")
            .in("sale_id", saleIds)
        : Promise.resolve({ data: [], error: null }),
      saleIds.length
        ? supabase
            .from("sale_items")
            .select("sale_id, item_type, is_courtesy")
            .in("sale_id", saleIds)
        : Promise.resolve({ data: [], error: null }),
      sessionIds.length
        ? supabase.from("pos_sessions").select("id, status").in("id", sessionIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (paymentsResult.error || itemsResult.error || sessionStatusResult.error) {
      throw new Error(
        paymentsResult.error?.message ||
          itemsResult.error?.message ||
          sessionStatusResult.error?.message ||
          "No se pudo completar el historial de ventas.",
      );
    }

    const paymentsBySale = new Map<string, SalePaymentRow[]>();
    for (const payment of (paymentsResult.data ?? []) as SalePaymentRow[]) {
      const current = paymentsBySale.get(payment.sale_id) ?? [];
      current.push(payment);
      paymentsBySale.set(payment.sale_id, current);
    }

    const itemsBySale = new Map<string, SaleItemRow[]>();
    for (const item of (itemsResult.data ?? []) as SaleItemRow[]) {
      const current = itemsBySale.get(item.sale_id) ?? [];
      current.push(item);
      itemsBySale.set(item.sale_id, current);
    }

    const sessionStatusMap = new Map(
      ((sessionStatusResult.data ?? []) as Array<{ id: string; status: "open" | "closed" }>).map(
        (session) => [session.id, session.status],
      ),
    );

    const filteredSales = sales.filter((sale) => {
      const customerName = unwrapRelation(sale.customer)?.full_name ?? "";
      if (customer && !customerName.toLowerCase().includes(customer)) {
        return false;
      }

      const payments = paymentsBySale.get(sale.id) ?? [];
      if (paymentMethodId && !payments.some((payment) => payment.payment_method_id === paymentMethodId)) {
        return false;
      }

      const items = itemsBySale.get(sale.id) ?? [];
      if (itemType && !items.some((item) => item.item_type === itemType)) {
        return false;
      }

      if (courtesy === "with_courtesy" && !items.some((item) => item.is_courtesy)) {
        return false;
      }

      if (courtesy === "without_courtesy" && items.some((item) => item.is_courtesy)) {
        return false;
      }

      return true;
    });

    return NextResponse.json({
      data: filteredSales.map((sale) => {
        const paymentLabels = Array.from(
          new Set(
            (paymentsBySale.get(sale.id) ?? []).map(
              (payment) => unwrapRelation(payment.payment_method)?.name ?? "Metodo",
            ),
          ),
        );
        const itemTypes = Array.from(
          new Set((itemsBySale.get(sale.id) ?? []).map((item) => item.item_type)),
        ) as Array<"service" | "product">;
        const sessionStatus = sessionStatusMap.get(sale.pos_session_id);

        return {
          id: sale.id,
          saleReference: formatSaleReference(sale.id),
          createdAt: sale.created_at,
          closedAt: sale.closed_at,
          status: sale.status,
          customerName: unwrapRelation(sale.customer)?.full_name ?? "Cliente",
          branchName: unwrapRelation(sale.branch)?.name ?? "Sin sede",
          barberName: unwrapRelation(sale.barber)?.full_name ?? null,
          total: toMoneyNumber(sale.total),
          paidTotal: toMoneyNumber(sale.paid_total),
          changeAmount: toMoneyNumber(sale.change_amount),
          paymentMethodLabels: paymentLabels,
          posSessionLabel: formatSessionLabel(sale.pos_session_id),
          hasCourtesy:
            toMoneyNumber(sale.courtesy_total) > 0 ||
            (itemsBySale.get(sale.id) ?? []).some((item) => item.is_courtesy),
          itemTypes,
          canCancel: sale.status === "completed" && sessionStatus === "open",
        };
      }),
      filters: {
        branches: ((branchesResult.data ?? []) as OptionRow[]).map((branch) => ({
          id: branch.id,
          label: branch.name ?? "Sede",
        })),
        barbers: ((barbersResult.data ?? []) as OptionRow[]).map((barber) => ({
          id: barber.id,
          label: barber.full_name ?? "Barbero",
        })),
        paymentMethods: ((paymentMethodsResult.data ?? []) as OptionRow[]).map((method) => ({
          id: method.id,
          label: method.name ?? "Metodo",
        })),
        sessions: ((sessionsResult.data ?? []) as OptionRow[]).map((session) => ({
          id: session.id,
          label: `${formatSessionLabel(session.id)} · ${unwrapRelation(session.branch)?.name ?? "Sede"}`,
        })),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    console.error("[sales/get] Error al cargar historial de ventas", { message });
    return NextResponse.json(
      { error: mapPosErrorMessage(message) },
      { status: 400 },
    );
  }
}
