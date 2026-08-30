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
  const [entries, initialCategories, branches, methods] = await Promise.all([
    entriesQuery,
    supabase
      .from("finance_categories")
      .select("id,name,code,direction,financial_group,affects_profit")
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
    supabase
      .from("branches")
      .select("id,name")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("payment_methods")
      .select("id,name")
      .eq("is_active", true)
      .order("sort_order"),
  ]);
  let categories = initialCategories;
  const error =
    entries.error ?? categories.error ?? branches.error ?? methods.error;
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
        .select("id,name,code,direction,financial_group,affects_profit")
        .eq("is_active", true)
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
    !["income", "expense"].includes(payload?.direction) ||
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
  const supabase = await createClient();
  const [
    { data: employeeId },
    { data: businessDate, error: businessDateError },
  ] = await Promise.all([
    supabase.rpc("current_employee_id"),
    supabase.rpc("pos_business_date"),
  ]);
  if (!entryDate && (businessDateError || !businessDate)) {
    console.error("[finance/post] Error al obtener fecha operativa", {
      message: businessDateError?.message,
    });
    return NextResponse.json(
      { error: "No se pudo determinar la fecha operativa." },
      { status: 500 },
    );
  }
  const { data, error } = await supabase
    .from("finance_manual_entries")
    .insert({
      branch_id: payload.branchId || null,
      entry_date: entryDate || businessDate,
      direction: payload.direction,
      category_id: payload.categoryId,
      amount,
      payment_method_id: payload.paymentMethodId || null,
      description: String(payload.description).trim(),
      reference: String(payload.reference ?? "").trim() || null,
      created_by: employeeId ?? null,
    })
    .select()
    .single();
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
