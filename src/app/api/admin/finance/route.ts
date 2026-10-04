import { NextResponse } from "next/server";

import { ensureDefaultFinanceCategories } from "@/lib/operational/ensure-default-categories";
import { createClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/supabase/route-auth";

function validDate(value: string | null) {
  return Boolean(
    value &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(`${value}T12:00:00Z`)),
  );
}

export async function GET(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const branchId = searchParams.get("branchId")?.trim() || "";
  if (
    (dateFrom && !validDate(dateFrom)) ||
    (dateTo && !validDate(dateTo)) ||
    (dateFrom && dateTo && dateFrom > dateTo)
  ) {
    return NextResponse.json(
      { error: "Selecciona un rango de fechas válido." },
      { status: 400 },
    );
  }
  const supabase = await createClient();
  let entriesQuery = supabase
    .from("finance_manual_entries")
    .select(
      "*, category:finance_categories(name,code,financial_group,affects_profit), branch:branches(name), payment_method:payment_methods(name)",
    )
    .order("entry_date", { ascending: false })
    .limit(200);
  if (dateFrom) entriesQuery = entriesQuery.gte("entry_date", dateFrom);
  if (dateTo) entriesQuery = entriesQuery.lte("entry_date", dateTo);
  if (branchId) entriesQuery = entriesQuery.eq("branch_id", branchId);
  const [entries, initialCategories, branches, methods, payables] = await Promise.all([
    entriesQuery,
    supabase
      .from("finance_categories")
      .select("id,name,code,direction,financial_group,affects_profit,is_manual_selectable")
      .eq("is_active", true)
      .eq("is_manual_selectable", true)
      .order("sort_order")
      .order("name"),
    supabase
      .from("branches")
      .select("id,name")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("payment_methods")
      .select("id,name,counts_as_cash,payment_kind")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("accounts_payable")
      .select("id,branch_id,accounting_date,original_amount,outstanding_amount,status,due_date,description,source_type,source_id,branch:branches(name), payments:accounts_payable_payments(id,amount,paid_at,reference,status,reversed_at,reversal_reason_code,reversal_reason,payment_method:payment_methods(name))")
      .in("status", ["open", "pending", "partial", "paid", "cancelled"])
      .order("accounting_date", { ascending: true }),
  ]);
  let categories = initialCategories;
  const error =
    entries.error ?? categories.error ?? branches.error ?? methods.error ?? payables.error;
  if (error) {
    console.error("[finance/get] Error al cargar finanzas", {
      message: error.message,
      code: error.code,
    });
    return NextResponse.json(
      { error: "No se pudo cargar el libro financiero." },
      { status: 500 },
    );
  }
  const requiredCategoryCodes = new Set(["other_income", "operating_expense"]);
  for (const category of categories.data ?? [])
    requiredCategoryCodes.delete(category.code);
  if (requiredCategoryCodes.size > 0) {
    try {
      await ensureDefaultFinanceCategories();
      categories = await supabase
        .from("finance_categories")
        .select("id,name,code,direction,financial_group,affects_profit,is_manual_selectable")
        .eq("is_active", true)
        .eq("is_manual_selectable", true)
        .order("sort_order")
        .order("name");
      if (categories.error) throw categories.error;
    } catch (categoryError) {
      const message =
        categoryError instanceof Error
          ? categoryError.message
          : "Error inesperado";
      console.error(
        "[finance/get] No se pudieron restaurar las categorias base",
        { message },
      );
      return NextResponse.json(
        { error: "No se pudieron preparar las categorias financieras." },
        { status: 500 },
      );
    }
  }
  return NextResponse.json({
    data: entries.data ?? [],
    categories: categories.data ?? [],
    branches: branches.data ?? [],
    paymentMethods: methods.data ?? [],
    payables: payables.data ?? [],
  });
}

export async function POST(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const payload = await request.json().catch(() => null);
  const amount = Number(payload?.amount);
  const entryDate = String(payload?.entryDate ?? "").trim();
  if (
    !payload?.categoryId ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !String(payload?.description ?? "").trim()
  ) {
    return NextResponse.json(
      { error: "Completa tipo, categoria, monto y descripcion." },
      { status: 400 },
    );
  }
  if (entryDate && !validDate(entryDate)) {
    return NextResponse.json(
      { error: "La fecha del movimiento no es válida." },
      { status: 400 },
    );
  }
  const paymentStatus = payload.paymentStatus === "pending" ? "pending" : "paid";
  const supabase = await createClient();
  const { data: category, error: categoryError } = await supabase
    .from("finance_categories")
    .select("id,is_active,is_manual_selectable")
    .eq("id", payload.categoryId)
    .maybeSingle();
  if (categoryError || !category?.is_active || !category.is_manual_selectable) {
    return NextResponse.json(
      { error: "Esta categoría no está disponible para un movimiento manual. Usa Deudas de empleados para adelantos o préstamos." },
      { status: 400 },
    );
  }
  const { data: businessDate, error: businessDateError } = await supabase.rpc("pos_business_date");
  if (businessDateError || !businessDate) {
    return NextResponse.json({ error: "No se pudo resolver la fecha operativa." }, { status: 500 });
  }
  const { data, error } = await supabase.rpc("create_operational_finance_entry", {
    p_category_id: payload.categoryId,
    p_branch_id: payload.branchId || null,
    p_accounting_date: entryDate || businessDate,
    p_amount: amount,
    p_description: String(payload.description).trim(),
    p_payment_status: paymentStatus,
    p_payment_method_id: paymentStatus === "paid" ? payload.paymentMethodId || null : null,
    p_payment_date: paymentStatus === "paid" ? payload.paymentDate || businessDate : null,
    p_due_date: paymentStatus === "pending" ? payload.dueDate || null : null,
    p_reference: String(payload.reference ?? "").trim() || null,
    p_evidence_url: String(payload.evidenceUrl ?? "").trim() || null,
    p_notes: String(payload.notes ?? "").trim() || null,
  });
  if (error) {
    console.error("[finance/post] Error al crear asiento", {
      message: error.message,
      code: error.code,
    });
    return NextResponse.json(
      { error: "No se pudo registrar el movimiento financiero." },
      { status: 400 },
    );
  }
  return NextResponse.json({ data });
}
