import { NextResponse } from "next/server";

import { getPublicAppUrl } from "@/lib/auth/public-url";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/security/rate-limit";

const genericMessage = "Si el correo está registrado, recibirá un enlace para restablecer tu contraseña.";

export async function POST(request: Request) {
  const retryAfter = await enforceRateLimit(request, "password-recovery", 5, 15 * 60 * 1000);
  if (retryAfter) {
    return NextResponse.json(
      { data: { message: genericMessage } },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const payload = await request.json().catch(() => null);
  const email = typeof payload?.email === "string" ? payload.email.trim().toLowerCase() : "";
  const appUrl = getPublicAppUrl();
  if (!email || !appUrl) return NextResponse.json({ data: { message: genericMessage } });
  const admin = getSupabaseAdmin();
  const supabase = await createClient();
  const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${appUrl}/auth/confirm?next=/restablecer-contrasena` });
  if (recoveryError) console.warn("[auth/recovery] No se pudo solicitar recuperación", { name: recoveryError.name, status: recoveryError.status });
  const { data: employee, error: employeeError } = await admin.from("employees").select("id,branch_id").eq("email", email).maybeSingle();
  if (employeeError) console.error("[auth/recovery] No se pudo resolver auditoría", { message: employeeError.message, code: employeeError.code });
  if (employee) {
    const { error: auditError } = await admin.from("audit_logs").insert({ actor_employee_id: null, branch_id: employee.branch_id, action: "password_recovery_requested", entity: "employees", entity_id: employee.id, metadata: { origin: "login" } });
    if (auditError) console.error("[auth/recovery] No se pudo registrar auditoría", { message: auditError.message, code: auditError.code, employeeId: employee.id });
  }
  return NextResponse.json({ data: { message: genericMessage } });
}
