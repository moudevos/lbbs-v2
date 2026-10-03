import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/supabase/route-auth";
import { createClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_compensation_terms")
    .select("id,employee_id,compensation_mode,commission_rate,fixed_amount,base_monthly_salary,mandatory_discount_enabled,mandatory_discount_rate,compensation_policy_version,fixed_period,effective_from,effective_to,is_active,notes,created_at")
    .eq("employee_id", id)
    .order("effective_from", { ascending: false });
  if (error) {
    console.error("[employee-compensation/get] Error", { message: error.message, code: error.code });
    return NextResponse.json({ error: "No se pudo cargar la compensación." }, { status: 500 });
  }
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request, { params }: Context) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { id } = await params;
  const payload = await request.json().catch(() => null);
  const mode = typeof payload?.compensationMode === "string" ? payload.compensationMode : "";
  const effectiveFrom = typeof payload?.effectiveFrom === "string" ? payload.effectiveFrom : "";
  const baseMonthlySalary = payload?.baseMonthlySalary === "" || payload?.baseMonthlySalary === undefined ? null : Number(payload.baseMonthlySalary);
  const mandatoryDiscountEnabled = payload?.mandatoryDiscountEnabled !== false;
  const mandatoryDiscountRate = payload?.mandatoryDiscountRate === "" || payload?.mandatoryDiscountRate === undefined ? 1 : Number(payload.mandatoryDiscountRate);
  if (!effectiveFrom || !Number.isFinite(baseMonthlySalary ?? 0) || !Number.isFinite(mandatoryDiscountRate)) {
    return NextResponse.json({ error: "Completa los datos válidos de compensación." }, { status: 400 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_employee_compensation_term_v176", {
    p_employee_id: id,
    p_compensation_type: mode,
    p_base_monthly_salary: baseMonthlySalary,
    p_mandatory_discount_enabled: mandatoryDiscountEnabled,
    p_mandatory_discount_rate: mandatoryDiscountRate,
    p_effective_from: effectiveFrom,
    p_notes: typeof payload?.notes === "string" ? payload.notes : null,
    p_replace_current: Boolean(payload?.replaceCurrent),
  });
  if (error) {
    console.error("[employee-compensation/post] Error", { message: error.message, code: error.code });
    return NextResponse.json({ error: error.message || "No se pudo guardar la compensación." }, { status: 400 });
  }
  return NextResponse.json({ data });
}
