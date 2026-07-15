import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return NextResponse.json({ error: "La sesión ya no es válida." }, { status: 401 });
  const admin = getSupabaseAdmin();
  const { data: employee, error: employeeError } = await admin.from("employees").select("id,branch_id").eq("user_id", userData.user.id).maybeSingle();
  if (employeeError || !employee) return NextResponse.json({ error: "No se pudo registrar la acción de seguridad." }, { status: 500 });
  const { error: auditError } = await admin.from("audit_logs").insert({ actor_employee_id: employee.id, branch_id: employee.branch_id, action: "other_sessions_closed", entity: "employees", entity_id: employee.id, metadata: { origin: "mi_cuenta" } });
  if (auditError) console.error("[auth/password] No se pudo registrar cierre de otras sesiones", { message: auditError.message, code: auditError.code, employeeId: employee.id });
  return NextResponse.json({ data: { recorded: true } });
}
