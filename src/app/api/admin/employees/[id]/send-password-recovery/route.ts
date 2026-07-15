import { NextResponse } from "next/server";

import { getPublicAppUrl } from "@/lib/auth/public-url";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/supabase/route-auth";
import { createClient } from "@/lib/supabase/server";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const appUrl = getPublicAppUrl();
  if (!appUrl) return NextResponse.json({ error: "La URL pública no está configurada." }, { status: 500 });
  const { id } = await params;
  const admin = getSupabaseAdmin();
  const supabase = await createClient();
  const [{ data: actorId }, { data: employee, error: employeeError }] = await Promise.all([
    supabase.rpc("current_employee_id"),
    admin.from("employees").select("id,user_id,branch_id,can_login,status").eq("id", id).maybeSingle(),
  ]);
  if (employeeError || !employee) return NextResponse.json({ error: "No se pudo solicitar la recuperación para este empleado." }, { status: employeeError ? 500 : 404 });
  if (!employee.user_id || !employee.can_login || employee.status !== "active") return NextResponse.json({ error: "El empleado no tiene un acceso activo para recuperar." }, { status: 400 });
  const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(employee.user_id);
  if (authUserError || !authUser.user?.email) {
    console.error("[employees/recovery] No se pudo leer el usuario Auth", { message: authUserError?.message, code: authUserError?.code, employeeId: id });
    return NextResponse.json({ error: "No se pudo solicitar la recuperación para este empleado." }, { status: 500 });
  }
  const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(authUser.user.email, { redirectTo: `${appUrl}/auth/confirm?next=/restablecer-contrasena` });
  if (recoveryError) {
    console.error("[employees/recovery] No se pudo solicitar recuperación", { message: recoveryError.message, status: recoveryError.status, employeeId: id });
    return NextResponse.json({ error: "No se pudo solicitar el envío del enlace." }, { status: 500 });
  }
  const sentAt = new Date().toISOString();
  const { error: updateError } = await admin.from("employees").update({ password_recovery_sent_at: sentAt, password_recovery_sent_by: actorId ?? null }).eq("id", id);
  if (updateError) console.error("[employees/recovery] No se pudo actualizar seguimiento", { message: updateError.message, code: updateError.code, employeeId: id });
  const { error: auditError } = await admin.from("audit_logs").insert({ actor_employee_id: actorId ?? null, branch_id: employee.branch_id, action: "admin_password_recovery_requested", entity: "employees", entity_id: employee.id, metadata: { origin: "team" } });
  if (auditError) console.error("[employees/recovery] No se pudo registrar auditoría", { message: auditError.message, code: auditError.code, employeeId: id });
  return NextResponse.json({ data: { requested: true } });
}
