import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/supabase/route-auth";

export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const supabase = await createClient();
  const [entries, categories, branches, methods] = await Promise.all([
    supabase.from("finance_manual_entries").select("*, category:finance_categories(name), branch:branches(name), payment_method:payment_methods(name)").order("entry_date", { ascending: false }).limit(200),
    supabase.from("finance_categories").select("id,name,code,direction").eq("is_active", true).order("sort_order").order("name"),
    supabase.from("branches").select("id,name").eq("is_active", true).order("name"),
    supabase.from("payment_methods").select("id,name").eq("is_active", true).order("sort_order"),
  ]);
  const error = entries.error ?? categories.error ?? branches.error ?? methods.error;
  if (error) {
    console.error("[finance/get] Error al cargar finanzas", { message: error.message, code: error.code });
    return NextResponse.json({ error: "No se pudo cargar el libro financiero." }, { status: 500 });
  }
  return NextResponse.json({ data: entries.data ?? [], categories: categories.data ?? [], branches: branches.data ?? [], paymentMethods: methods.data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const payload = await request.json().catch(() => null);
  const amount = Number(payload?.amount);
  if (!payload?.categoryId || !["income", "expense"].includes(payload?.direction) || !Number.isFinite(amount) || amount <= 0 || !String(payload?.description ?? "").trim()) {
    return NextResponse.json({ error: "Completa tipo, categoria, monto y descripcion." }, { status: 400 });
  }
  const supabase = await createClient();
  const { data: employeeId } = await supabase.rpc("current_employee_id");
  const { data, error } = await supabase.from("finance_manual_entries").insert({
    branch_id: payload.branchId || null,
    entry_date: payload.entryDate || new Date().toISOString().slice(0, 10),
    direction: payload.direction,
    category_id: payload.categoryId,
    amount,
    payment_method_id: payload.paymentMethodId || null,
    description: String(payload.description).trim(),
    reference: String(payload.reference ?? "").trim() || null,
    created_by: employeeId ?? null,
  }).select().single();
  if (error) {
    console.error("[finance/post] Error al crear asiento", { message: error.message, code: error.code });
    return NextResponse.json({ error: "No se pudo registrar el movimiento financiero." }, { status: 400 });
  }
  return NextResponse.json({ data });
}
