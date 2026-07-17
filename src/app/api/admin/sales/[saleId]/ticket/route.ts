import { NextResponse } from "next/server";

import { formatSaleReference, toMoneyNumber } from "@/app/api/admin/pos/route-helpers";
import type { SaleDocumentPayload } from "@/lib/sales/sale-document-types";
import { createClient } from "@/lib/supabase/server";
import { requirePosWriteSession } from "@/lib/supabase/route-auth";

function unwrap<T>(value: T[] | T | null | undefined) { return Array.isArray(value) ? value[0] ?? null : value ?? null; }

export async function GET(_request: Request, context: { params: Promise<{ saleId: string }> }) {
  const auth = await requirePosWriteSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { saleId } = await context.params;
  const supabase = await createClient();
  const { data: currentState, error: stateError } = await supabase.from("sales").select("status,cancelled_at,cancelled_reason,cancellation_notes,cancelled_by_employee:employees!sales_cancelled_by_fkey(full_name)").eq("id", saleId).maybeSingle();
  if (stateError) {
    console.error("[sales/ticket] Error al leer estado actual", { saleId, message: stateError?.message, code: stateError?.code, details: stateError?.details, hint: stateError?.hint });
    if (stateError.code === "PGRST205") {
      return NextResponse.json({ error: "Los tickets aun no estan disponibles porque falta completar la configuracion de base de datos.", code: "TICKET_SCHEMA_NOT_READY" }, { status: 503 });
    }
    return NextResponse.json({ error: "No se pudo validar el estado de la venta.", code: "TICKET_LOAD_ERROR" }, { status: 500 });
  }
  if (!currentState) {
    return NextResponse.json({ error: "La venta no existe.", code: "SALE_NOT_FOUND" }, { status: 404 });
  }
  const applyCurrentState = (payload: SaleDocumentPayload): SaleDocumentPayload => ({ ...payload, sale: { ...payload.sale, status: currentState.status as "completed" | "cancelled", cancellation: currentState.status === "cancelled" ? { cancelled_at: currentState.cancelled_at, cancelled_by: unwrap(currentState.cancelled_by_employee)?.full_name ?? null, reason: currentState.cancelled_reason, notes: currentState.cancellation_notes } : null } });

  const { data: existing, error: existingError } = await supabase
    .from("sale_document_snapshots")
    .select("payload")
    .eq("sale_id", saleId).eq("document_type", "internal_ticket").eq("schema_version", "1.0").eq("status", "active")
    .maybeSingle();
  if (existingError) {
    console.error("[sales/ticket] Error al leer snapshot", { saleId, message: existingError.message, code: existingError.code, details: existingError.details, hint: existingError.hint });
    if (existingError.code === "PGRST205") {
      return NextResponse.json({ error: "Los tickets aun no estan disponibles porque falta completar la configuracion de base de datos.", code: "TICKET_SCHEMA_NOT_READY" }, { status: 503 });
    }
    return NextResponse.json({ error: "No se pudo cargar el ticket de esta venta." }, { status: 500 });
  }
  if (existing?.payload) return NextResponse.json({ data: applyCurrentState(existing.payload as SaleDocumentPayload), fromSnapshot: true });

  const [saleResult, itemsResult, paymentsResult, rewardResult] = await Promise.all([
    supabase.from("sales").select("id,status,subtotal,discount_total,courtesy_total,total,paid_total,change_amount,closed_at,created_at,branch:branches(id,name,slug,address,phone),customer:customers(id,document_type,document_number,full_name,phone),cashier:employees!sales_closed_by_fkey(id,full_name),barber:employees!sales_barber_id_fkey(id,full_name)").eq("id", saleId).maybeSingle(),
    supabase.from("sale_items").select("id,item_type,service_id,product_id,description_snapshot,quantity,unit_price,discount_amount,total,is_courtesy").eq("sale_id", saleId).order("created_at"),
    supabase.from("sale_payments").select("amount,tendered_amount,change_amount,reference,payment_method:payment_methods(code,name)").eq("sale_id", saleId).order("created_at"),
    supabase.from("reward_redemptions").select("entitlement_id,discount_amount,benefit:reward_benefits(name)").eq("sale_id", saleId).eq("status", "applied").maybeSingle(),
  ]);
  const error = saleResult.error ?? itemsResult.error ?? paymentsResult.error ?? rewardResult.error;
  if (error || !saleResult.data) {
    console.error("[sales/ticket] Error al construir snapshot", { saleId, message: error?.message, code: error?.code, details: error?.details, hint: error?.hint });
    return NextResponse.json({ error: "No se pudo preparar el ticket de esta venta." }, { status: 400 });
  }
  const sale = saleResult.data as Record<string, unknown>;
  const branch = unwrap(sale.branch as { id: string; name: string; slug: string | null; address: string | null; phone: string | null }[] | null);
  const customer = unwrap(sale.customer as { id: string; document_type: string | null; document_number: string | null; full_name: string; phone: string | null }[] | null);
  const cashier = unwrap(sale.cashier as { id: string; full_name: string }[] | null);
  const barber = unwrap(sale.barber as { id: string; full_name: string }[] | null);
  const reward = rewardResult.data ? { entitlement_id: String(rewardResult.data.entitlement_id), name: unwrap(rewardResult.data.benefit as { name: string | null }[] | null)?.name ?? "Reward", amount: toMoneyNumber(rewardResult.data.discount_amount) } : null;
  let remainingReward = reward?.amount ?? 0;
  const items = (itemsResult.data ?? []).map((item) => {
    const gross = toMoneyNumber(item.quantity) * toMoneyNumber(item.unit_price);
    const discount = toMoneyNumber(item.discount_amount);
    const rewardDiscount = Math.min(discount, remainingReward);
    remainingReward = Math.max(remainingReward - rewardDiscount, 0);
    return { type: item.item_type as "service" | "product", reference_id: item.service_id ?? item.product_id ?? null, sku: null, description: item.description_snapshot, quantity: toMoneyNumber(item.quantity), unit_price: toMoneyNumber(item.unit_price), gross_amount: Number(gross.toFixed(2)), commercial_discount: Number(Math.max(discount - rewardDiscount, 0).toFixed(2)), reward_discount: Number(rewardDiscount.toFixed(2)), courtesy_discount: item.is_courtesy ? Number(gross.toFixed(2)) : 0, net_amount: toMoneyNumber(item.total) };
  });
  const payload: SaleDocumentPayload = {
    schema_version: "1.0", document_type: "internal_ticket", currency: "PEN",
    sale: { id: String(sale.id), number: formatSaleReference(String(sale.id)), issued_at: String(sale.closed_at ?? sale.created_at), status: sale.status as "completed" | "cancelled" },
    issuer: { business_name: "La Bajadita Barber Studio", trade_name: "LBBS", tax_id: null },
    branch: { id: branch?.id ?? "", code: branch?.slug ?? null, name: branch?.name ?? "Sede", address: branch?.address ?? null, phone: branch?.phone ?? null },
    customer: { id: customer?.id ?? "", document_type: customer?.document_type ?? null, document_number: customer?.document_number ?? null, name: customer?.full_name ?? "Cliente", phone: customer?.phone ?? null },
    employees: { cashier: { id: cashier?.id ?? null, name: cashier?.full_name ?? null }, barber: { id: barber?.id ?? null, name: barber?.full_name ?? null } },
    items, reward,
    totals: { gross_amount: toMoneyNumber(sale.subtotal), commercial_discount: Number(Math.max(toMoneyNumber(sale.discount_total) - (reward?.amount ?? 0), 0).toFixed(2)), reward_discount: reward?.amount ?? 0, courtesy_discount: toMoneyNumber(sale.courtesy_total), payable_amount: toMoneyNumber(sale.total), paid_amount: toMoneyNumber(sale.paid_total), change_amount: toMoneyNumber(sale.change_amount) },
    payments: (paymentsResult.data ?? []).map((payment) => { const method = unwrap(payment.payment_method as { code: string | null; name: string | null }[] | null); return { method_code: method?.code ?? "other", method_name: method?.name ?? "Metodo", applied_amount: toMoneyNumber(payment.amount), tendered_amount: payment.tendered_amount === null ? toMoneyNumber(payment.amount) : toMoneyNumber(payment.tendered_amount), change_amount: toMoneyNumber(payment.change_amount), reference: payment.reference }; }),
    future_see: { document_code: null, series: null, correlative: null, operation_type: null, taxable_amount: null, tax_amount: null },
    metadata: { source: "LBBS_POS", generated_at: new Date().toISOString(), non_fiscal: true },
  };
  const [{ data: employeeId }, { data: authData }] = await Promise.all([
    supabase.rpc("current_employee_id"),
    supabase.auth.getUser(),
  ]);
  const { error: insertError } = await supabase.from("sale_document_snapshots").insert({ sale_id: saleId, document_type: "internal_ticket", schema_version: "1.0", payload, generated_by: employeeId ?? null });
  if (insertError && insertError.code !== "23505") {
    console.error("[sales/ticket] Error al guardar snapshot", { saleId, employeeId, authUserId: authData.user?.id ?? null, message: insertError.message, code: insertError.code, details: insertError.details, hint: insertError.hint });
    return NextResponse.json({ error: "La venta se cerro, pero no se pudo guardar su ticket." }, { status: 500 });
  }
  return NextResponse.json({ data: applyCurrentState(payload), fromSnapshot: false });
}
