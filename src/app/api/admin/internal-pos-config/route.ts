import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/supabase/route-auth";

export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const supabase = await createClient();
  const [employees, customers, links, rules, socioRules, socios, socioAssignments, branches, services, products] = await Promise.all([
    supabase.from("employees").select("id,full_name,role,branch_id").eq("status", "active").order("full_name"),
    supabase.from("customers").select("id,full_name,document_number,phone").eq("is_active", true).order("full_name").limit(1000),
    supabase.from("employee_customer_links").select("id,employee_id,customer_id,can_use_internal_credit,is_active,employee:employees!employee_customer_links_employee_id_fkey(full_name),customer:customers!employee_customer_links_customer_id_fkey(full_name,document_number)").order("linked_at", { ascending: false }),
    supabase.from("employee_benefit_rules").select("*").neq("beneficiary_scope", "socio").order("created_at", { ascending: false }),
    supabase.from("employee_benefit_rules").select("id,name,benefit_type,benefit_value,usage_limit,is_active,recognized_production_amount,operational_contribution,effective_from,effective_to").eq("beneficiary_scope", "socio").order("created_at", { ascending: false }),
    supabase.from("socios").select("id,status,starts_at,ends_at,customer:customers!socios_customer_id_fkey(full_name,document_number)").order("created_at", { ascending: false }),
    supabase.from("socio_benefit_assignments").select("id,socio_id,status,starts_at,ends_at,rule:employee_benefit_rules(name)").order("created_at", { ascending: false }),
    supabase.from("branches").select("id,name").eq("is_active", true).order("name"),
    supabase.from("services").select("id,name").eq("is_active", true).order("name"),
    supabase.from("products").select("id,name").eq("is_active", true).order("name"),
  ]);
  const error = employees.error ?? customers.error ?? links.error ?? rules.error ?? socioRules.error ?? socios.error ?? socioAssignments.error ?? branches.error ?? services.error ?? products.error;
  if (error) return NextResponse.json({ error: "No se pudo cargar la configuración interna." }, { status: 500 });
  return NextResponse.json({ data: { employees: employees.data ?? [], customers: customers.data ?? [], links: links.data ?? [], rules: rules.data ?? [], socioRules: socioRules.data ?? [], socios: socios.data ?? [], socioAssignments: socioAssignments.data ?? [], branches: branches.data ?? [], services: services.data ?? [], products: products.data ?? [] } });
}

export async function POST(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const body = await request.json().catch(() => null);
  const supabase = await createClient();
  const { data: employeeId } = await supabase.rpc("current_employee_id");
  if (body?.action === "authorization-pin") {
    const { error } = await supabase.rpc("set_owner_internal_authorization_pin", { p_pin: String(body.pin ?? "") });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  if (body?.action === "deactivate-rule") {
    if (!body.id) return NextResponse.json({ error: "Falta la regla a desactivar." }, { status: 400 });
    const { error } = await supabase.from("employee_benefit_rules").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", body.id);
    if (error) return NextResponse.json({ error: "No se pudo desactivar la regla." }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  if (body?.action === "link") {
    if (!body.employeeId || !body.customerId) return NextResponse.json({ error: "Selecciona empleado y cliente." }, { status: 400 });
    const { error } = await supabase.from("employee_customer_links").upsert({ employee_id: body.employeeId, customer_id: body.customerId, can_use_internal_credit: body.canUseCredit !== false, is_active: true, linked_by: employeeId, notes: String(body.notes ?? "").trim() || null }, { onConflict: "employee_id" });
    if (error) return NextResponse.json({ error: "No se pudo vincular; verifica que el cliente no esté asignado a otro empleado." }, { status: 400 });
  } else if (body?.action === "rule") {
    if (!body.name || !body.benefitType) return NextResponse.json({ error: "Nombre y beneficio son obligatorios." }, { status: 400 });
    const { data: businessDate, error: businessDateError } = await supabase.rpc("pos_business_date");
    if (businessDateError) return NextResponse.json({ error: "No se pudo determinar la fecha operativa de Lima." }, { status: 500 });
    const effectiveFrom = /^\d{4}-\d{2}-\d{2}$/.test(String(body.effectiveFrom ?? "")) ? body.effectiveFrom : businessDate;
    const appliesTo = body.appliesTo === "all_services" ? "service" : body.appliesTo === "all_products" ? "product" : body.appliesTo ?? "all";
    const values = { name: String(body.name).trim(), description: String(body.description ?? "").trim() || null, applies_to: appliesTo, service_id: body.appliesTo === "service" ? body.catalogId || null : null, product_id: body.appliesTo === "product" ? body.catalogId || null : null, benefit_type: body.benefitType, benefit_value: Number(body.benefitValue ?? 0), period_kind: body.periodKind ?? "calendar_month", usage_limit: Number(body.usageLimit ?? 1), eligible_role: body.eligibleRole || null, branch_id: body.branchId || null, effective_from: effectiveFrom, production_mode: body.productionMode ?? "fixed", fixed_barber_payout: Number(body.fixedBarberPayout ?? 0), operational_contribution: Number(body.operationalContribution ?? 0), is_internal_complimentary: Boolean(body.internalComplimentary), requires_owner_authorization: Boolean(body.internalComplimentary), created_by: employeeId };
    // Editar nunca cambia una atención pasada: cierra la versión vigente y
    // crea otra para la fecha operativa de Lima.
    if (body.id) {
      const date = new Date(`${businessDate}T12:00:00Z`);
      date.setUTCDate(date.getUTCDate() - 1);
      const { data: previous, error: previousError } = await supabase.from("employee_benefit_rules").select("effective_from").eq("id", body.id).maybeSingle();
      if (previousError || !previous) return NextResponse.json({ error: "No se encontró la versión anterior." }, { status: 400 });
      const closeValues = previous.effective_from < businessDate ? { effective_to: date.toISOString().slice(0, 10) } : {};
      const { error: closeError } = await supabase.from("employee_benefit_rules").update({ ...closeValues, is_active: false, updated_at: new Date().toISOString() }).eq("id", body.id);
      if (closeError) return NextResponse.json({ error: "No se pudo cerrar la versión anterior." }, { status: 400 });
      const { error } = await supabase.from("employee_benefit_rules").insert({ ...values, effective_from: businessDate, created_by: employeeId });
      if (error) return NextResponse.json({ error: "No se pudo crear la nueva versión de la regla." }, { status: 400 });
      return NextResponse.json({ ok: true, versioned: true });
    }
    const { error } = await supabase.from("employee_benefit_rules").insert(values);
    if (error) return NextResponse.json({ error: "No se pudo guardar la regla." }, { status: 400 });
  } else return NextResponse.json({ error: "Acción inválida." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
