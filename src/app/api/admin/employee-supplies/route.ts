import { NextResponse } from "next/server";

import { requireAdminSession, requireTeamBranchSession } from "@/lib/supabase/route-auth";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const auth = await requireTeamBranchSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const supabase = await createClient();
  const branchId = auth.role === "reception" ? auth.branchId : null;
  if (auth.role === "reception" && !branchId) {
    return NextResponse.json({ error: "La cuenta de recepción no tiene una sede asignada." }, { status: 403 });
  }

  const [catalog, employees, branches, paymentMethods, products, batches] = await Promise.all([
    supabase
      .from("employee_supply_catalog_items")
      .select("id,product_id,employee_unit_price,is_active,updated_at,product:products(id,name,sku,cost_price)")
      .order("created_at", { ascending: false }),
    (branchId
      ? supabase.from("employees").select("id,full_name,branch_id").eq("status", "active").eq("branch_id", branchId)
      : supabase.from("employees").select("id,full_name,branch_id").eq("status", "active"))
      .order("full_name"),
    (branchId
      ? supabase.from("branches").select("id,name").eq("id", branchId).eq("is_active", true)
      : supabase.from("branches").select("id,name").eq("is_active", true))
      .order("name"),
    supabase.from("payment_methods").select("id,name,payment_kind").eq("is_active", true).neq("payment_kind", "internal_credit").order("sort_order"),
    auth.role === "reception"
      ? Promise.resolve({ data: [], error: null })
      : supabase.from("products").select("id,name,sku,cost_price").eq("is_active", true).order("name"),
    (branchId
      ? supabase.from("employee_supply_delivery_batches").select("id,employee_id,total_charge_amount,payment_mode,created_at,employee:employees(full_name)").eq("branch_id", branchId)
      : supabase.from("employee_supply_delivery_batches").select("id,employee_id,total_charge_amount,payment_mode,created_at,employee:employees(full_name)"))
      .order("created_at", { ascending: false })
      .limit(15),
  ]);
  const error = catalog.error ?? employees.error ?? branches.error ?? paymentMethods.error ?? products.error ?? batches.error;
  if (error) {
    console.error("[employee-supplies/get] Error", { message: error.message, code: error.code });
    return NextResponse.json({ error: "No se pudo cargar los insumos del personal." }, { status: 500 });
  }
  return NextResponse.json({
    role: auth.role,
    catalog: catalog.data ?? [],
    employees: employees.data ?? [],
    branches: branches.data ?? [],
    paymentMethods: paymentMethods.data ?? [],
    products: products.data ?? [],
    batches: batches.data ?? [],
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (body?.action === "catalog-create" || body?.action === "catalog-update") {
    const admin = await requireAdminSession();
    if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });
    const supabase = await createClient();
    if (body.action === "catalog-create") {
      if (!body.productId || !Number.isFinite(Number(body.employeeUnitPrice)) || Number(body.employeeUnitPrice) <= 0) {
        return NextResponse.json({ error: "Selecciona un producto e indica un precio interno válido." }, { status: 400 });
      }
      const { data: employeeId } = await supabase.rpc("current_employee_id");
      const { error } = await supabase.from("employee_supply_catalog_items").insert({
        product_id: body.productId,
        employee_unit_price: Number(body.employeeUnitPrice),
        created_by: employeeId ?? null,
      });
      if (error) return NextResponse.json({ error: error.code === "23505" ? "Ese producto ya está en el catálogo interno." : error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }
    if (!body.id || !Number.isFinite(Number(body.employeeUnitPrice)) || Number(body.employeeUnitPrice) <= 0 || typeof body.isActive !== "boolean") {
      return NextResponse.json({ error: "Los datos de catálogo no son válidos." }, { status: 400 });
    }
    const { error } = await supabase
      .from("employee_supply_catalog_items")
      .update({ employee_unit_price: Number(body.employeeUnitPrice), is_active: body.isActive, updated_at: new Date().toISOString() })
      .eq("id", body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const auth = await requireTeamBranchSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const branchId = auth.role === "reception" ? auth.branchId : body?.branchId;
  if (!body?.employeeId || !branchId || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "Empleado, sede y al menos un insumo son obligatorios." }, { status: 400 });
  }
  if (auth.role === "reception" && branchId !== auth.branchId) {
    return NextResponse.json({ error: "Recepción solo puede registrar entregas de su sede." }, { status: 403 });
  }
  const items = body.items.map((item: unknown) => {
    const value = item as { catalogItemId?: string; quantity?: unknown };
    return { catalog_item_id: value.catalogItemId, quantity: Number(value.quantity) };
  });
  if (items.some((item: { catalog_item_id?: string; quantity: number }) => !item.catalog_item_id || !Number.isFinite(item.quantity) || item.quantity <= 0)) {
    return NextResponse.json({ error: "Revisa las cantidades de los insumos." }, { status: 400 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_employee_supply_delivery_batch", {
    p_employee_id: body.employeeId,
    p_branch_id: branchId,
    p_items: items,
    p_payment_mode: body.paymentMode === "immediate" ? "immediate" : "credit",
    p_payment_method_id: body.paymentMode === "immediate" ? body.paymentMethodId || null : null,
    p_payment_reference: body.reference || null,
    p_notes: body.notes || null,
  });
  if (error) return NextResponse.json({ error: error.message || "No se pudo registrar la entrega." }, { status: 400 });
  return NextResponse.json({ data });
}
