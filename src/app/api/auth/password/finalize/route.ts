import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { validatePasswordPolicy } from "@/lib/auth/password-policy";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const recoveryCookie = "lbbs-password-recovery";
const validModes = new Set(["change", "recovery", "forced"]);

function createPasswordVerifier() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase no está configurado.");
  }

  return createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const mode = typeof payload?.mode === "string" ? payload.mode : "";
  const newPassword = typeof payload?.newPassword === "string" ? payload.newPassword : "";
  const currentPassword = typeof payload?.currentPassword === "string" ? payload.currentPassword : "";

  if (!validModes.has(mode) || !validatePasswordPolicy(newPassword).valid) {
    return NextResponse.json(
      { error: "No se pudo validar la actualización de contraseña." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return NextResponse.json({ error: "La sesión ya no es válida." }, { status: 401 });
  }

  const cookieStore = await cookies();
  const isRecovery = cookieStore.get(recoveryCookie)?.value === "1";

  if (mode === "recovery" && !isRecovery) {
    return NextResponse.json(
      { error: "El enlace de recuperación no es válido o ha vencido." },
      { status: 403 },
    );
  }

  if (mode !== "recovery") {
    if (!currentPassword || !userData.user.email) {
      return NextResponse.json(
        { error: "Debes confirmar tu contraseña actual para continuar." },
        { status: 400 },
      );
    }

    const verifier = createPasswordVerifier();
    const { data: verifiedUser, error: verificationError } =
      await verifier.auth.signInWithPassword({
        email: userData.user.email,
        password: currentPassword,
      });

    if (verificationError || verifiedUser.user?.id !== userData.user.id) {
      return NextResponse.json(
        { error: "Tu contraseña actual no es correcta." },
        { status: 400 },
      );
    }
  }

  const admin = getSupabaseAdmin();
  const { data: employee, error: employeeError } = await admin
    .from("employees")
    .select("id,branch_id,must_change_password")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (employeeError || !employee) {
    console.error("[auth/password] No se pudo resolver el empleado", {
      message: employeeError?.message,
      code: employeeError?.code,
    });
    return NextResponse.json(
      { error: "No se pudo completar la actualización. Intenta nuevamente." },
      { status: 500 },
    );
  }

  if (mode === "forced" && !employee.must_change_password) {
    return NextResponse.json(
      { error: "El cambio obligatorio ya no está pendiente." },
      { status: 400 },
    );
  }

  const { error: passwordError } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (passwordError) {
    console.error("[auth/password] No se pudo actualizar la contraseña", {
      name: passwordError.name,
      status: passwordError.status,
    });
    return NextResponse.json(
      { error: "No se pudo actualizar la contraseña. Solicita un nuevo enlace o inténtalo nuevamente." },
      { status: 400 },
    );
  }

  const action =
    mode === "recovery"
      ? "password_recovery_completed"
      : mode === "forced"
        ? "forced_password_change_completed"
        : "password_changed";
  const { error: updateError } = await admin
    .from("employees")
    .update({
      must_change_password: false,
      password_changed_at: new Date().toISOString(),
    })
    .eq("id", employee.id);

  if (updateError) {
    console.error("[auth/password] No se pudo actualizar el perfil", {
      message: updateError.message,
      code: updateError.code,
      employeeId: employee.id,
    });
    return NextResponse.json(
      { error: "La contraseña se actualizó, pero no se pudo finalizar el perfil. Reintenta iniciar sesión." },
      { status: 500 },
    );
  }

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_employee_id: employee.id,
    branch_id: employee.branch_id,
    action,
    entity: "employees",
    entity_id: employee.id,
    metadata: { origin: mode },
  });

  if (auditError) {
    console.error("[auth/password] No se pudo registrar auditoría", {
      message: auditError.message,
      code: auditError.code,
      employeeId: employee.id,
    });
  }

  const response = NextResponse.json({
    data: { redirectTo: mode === "forced" ? "/control" : "/login" },
  });

  if (mode === "recovery") {
    response.cookies.delete(recoveryCookie);
  }

  return response;
}
