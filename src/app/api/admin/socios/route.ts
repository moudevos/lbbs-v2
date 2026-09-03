import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/supabase/route-auth";

export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const supabase = await createClient();
  const [socios, assignments, rules, customers, branches, services] = await Promise.all([
    supabase.from("socios").select("id,customer_id,branch_id,code,status,starts_at,ends_at,notes,created_at,customer:customers!socios_customer_id_fkey(full_name,document_number)").order("created_at", { ascending: false }),
    supabase.from("socio_benefit_assignments").select("id,socio_id,benefit_rule_id,status,starts_at,ends_at,rule:employee_benefit_rules(name,usage_limit,period_kind,recognized_production_amount,operational_contribution)").order("created_at", { ascending: false }),
    supabase.from("employee_benefit_rules").select("id,name,is_active,effective_from,effective_to,recognized_production_amount,operational_contribution").eq("is_active", true).eq("beneficiary_scope", "socio").order("name"),
    supabase.from("customers").select("id,full_name,document_number").eq("is_active", true).order("full_name").limit(1000),
    supabase.from("branches").select("id,name").eq("is_active", true).order("name"),
    supabase.from("services").select("id,name").eq("is_active", true).order("name"),
  ]);
  const error = socios.error ?? assignments.error ?? rules.error ?? customers.error ?? branches.error ?? services.error;
  if (error) return NextResponse.json({ error: "No se pudo cargar Socios." }, { status: 500 });
  return NextResponse.json({ data: { socios: socios.data ?? [], assignments: assignments.data ?? [], rules: rules.data ?? [], customers: customers.data ?? [], branches: branches.data ?? [], services: services.data ?? [] } });
}

export async function POST(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const body = await request.json().catch(() => null);
  const supabase = await createClient();
  const { data: employeeId } = await supabase.rpc("current_employee_id");
  const { data: businessDate } = await supabase.rpc("pos_business_date");
  if (body?.action === "save") {
    if (!body.customerId) return NextResponse.json({ error: "Selecciona un cliente." }, { status: 400 });
    const values = { customer_id: body.customerId, branch_id: body.branchId || null, code: String(body.code ?? "").trim() || null, status: body.status === "inactive" ? "inactive" : "active", starts_at: body.startsAt || businessDate, ends_at: body.endsAt || null, notes: String(body.notes ?? "").trim() || null, updated_by: employeeId, updated_at: new Date().toISOString() };
    const query = body.id ? supabase.from("socios").update(values).eq("id", body.id) : supabase.from("socios").insert({ ...values, created_by: employeeId });
    const { error } = await query;
    if (error) return NextResponse.json({ error: "No se pudo guardar el socio. Cada cliente solo puede tener un perfil de socio." }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  if (body?.action === "assignment") {
    if (!body.socioId || !body.ruleId) return NextResponse.json({ error: "Selecciona socio y regla." }, { status: 400 });
    const { error } = await supabase.from("socio_benefit_assignments").insert({ socio_id: body.socioId, benefit_rule_id: body.ruleId, starts_at: body.startsAt || businessDate, ends_at: body.endsAt || null, status: "active", created_by: employeeId });
    if (error) return NextResponse.json({ error: "No se pudo asignar la regla al socio." }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  if (body?.action === "socio-rule") {
    const recognizedProductionAmount = Number(body.recognizedProductionAmount ?? 0);
    const operationalContribution = Number(body.operationalContribution ?? 0);
    const benefitType = body.benefitType === "fixed_price" ? "fixed_price" : "free";
    const benefitValue = Number(body.benefitValue ?? 0);
    if (!String(body.name ?? "").trim()) return NextResponse.json({ error: "Indica el nombre de la regla de socio." }, { status: 400 });
    if (!Number.isFinite(recognizedProductionAmount) || recognizedProductionAmount <= 0) return NextResponse.json({ error: "El valor reconocido para producción debe ser mayor que cero." }, { status: 400 });
    if (!Number.isFinite(operationalContribution) || operationalContribution < 0 || operationalContribution > recognizedProductionAmount) return NextResponse.json({ error: "El aporte debe estar entre S/ 0 y el valor reconocido." }, { status: 400 });
    if (benefitType === "fixed_price" && (!Number.isFinite(benefitValue) || benefitValue < 0)) return NextResponse.json({ error: "El precio único del socio debe ser válido." }, { status: 400 });
    const { error } = await supabase.from("employee_benefit_rules").insert({
      name: String(body.name).trim(),
      description: benefitType === "free" ? "Regla exclusiva de socio: atención sin cobro y producción reconocida al barbero." : "Regla exclusiva de socio: precio único y producción reconocida al barbero.",
      applies_to: "service",
      service_id: body.serviceId || null,
      benefit_type: benefitType,
      benefit_value: benefitType === "fixed_price" ? benefitValue : 0,
      period_kind: body.periodKind ?? "calendar_month",
      usage_limit: Number(body.usageLimit ?? 1),
      branch_id: body.branchId || null,
      production_mode: "percentage",
      fixed_barber_payout: 0,
      operational_contribution: operationalContribution,
      recognized_production_amount: recognizedProductionAmount,
      beneficiary_scope: "socio",
      is_internal_complimentary: false,
      requires_owner_authorization: false,
      effective_from: businessDate,
      created_by: employeeId,
    });
    if (error) return NextResponse.json({ error: "No se pudo crear la regla exclusiva de socio." }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  if (body?.action === "deactivate-assignment") {
    const { error } = await supabase.from("socio_benefit_assignments").update({ status: "inactive", ends_at: body.endsAt, updated_at: new Date().toISOString() }).eq("id", body.id);
    if (error) return NextResponse.json({ error: "No se pudo desactivar la asignación." }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Acción inválida." }, { status: 400 });
}
