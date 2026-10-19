import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/supabase/route-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const branchId = new URL(request.url).searchParams.get("branchId");
  if (!branchId || !uuid.test(branchId)) return NextResponse.json({ error: "Sede inválida." }, { status: 400 });
  const admin = getSupabaseAdmin();
  const { data: credentials, error } = await admin.from("hotspot_staff_credentials")
    .select("id,employee_id").eq("branch_id", branchId);
  if (error) return NextResponse.json({ error: "No se pudo consultar el personal Staff." }, { status: 500 });
  const ids = (credentials ?? []).map(c => c.id);
  if (!ids.length) return NextResponse.json({ data: [] });
  const { data: sessions, error: sessionError } = await admin.from("hotspot_staff_sessions")
    .select("id,credential_id,device_id,router_id,started_at,ended_at,end_reason")
    .in("credential_id", ids).order("started_at", { ascending: false }).limit(100);
  if (sessionError) return NextResponse.json({ error: "No se pudo consultar el historial Staff." }, { status: 500 });
  const { data: employees } = await admin.from("employees").select("id,full_name")
    .in("id", (credentials ?? []).map(c => c.employee_id));
  const names = new Map((employees ?? []).map(e => [e.id, e.full_name]));
  const employeeByCredential = new Map((credentials ?? []).map(c => [c.id, c.employee_id]));
  return NextResponse.json({ data: (sessions ?? []).map(s => ({
    ...s, employee_name: names.get(employeeByCredential.get(s.credential_id) ?? "") ?? "Empleado",
  })) });
}
