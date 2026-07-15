import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

function getRoleLabel(role: string | null) {
  if (role === "owner") {
    return "Administrador principal";
  }

  if (role === "admin") {
    return "Administrador";
  }

  if (role === "reception") {
    return "Recepcion";
  }

  if (role === "barber") {
    return "Barbero";
  }

  if (role === "viewer") {
    return "Visualizador";
  }

  return "Sin rol asignado";
}

export async function GET() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    console.error("[auth/sesion] No se pudo leer la sesion actual", {
      message: userError?.message,
      status: userError?.status,
    });
    return NextResponse.json(
      { error: "No se pudo cargar la sesion actual." },
      { status: 401 },
    );
  }

  const { data: role, error: roleError } = await supabase.rpc("current_user_role");
  if (roleError) {
    console.error("[auth/sesion] No se pudo leer el rol actual", {
      message: roleError.message,
      code: roleError.code,
    });
    return NextResponse.json(
      { error: "No se pudo cargar el rol actual." },
      { status: 500 },
    );
  }

  const employeeIdResult = await supabase.rpc("current_employee_id");
  const employeeId = employeeIdResult.data ?? null;

  let employee:
    | {
        full_name: string | null;
        email: string | null;
        role: string | null;
        avatar_url: string | null;
        branch_id: string | null;
        must_change_password: boolean;
        password_changed_at: string | null;
        branch?: { name: string | null }[] | { name: string | null } | null;
      }
    | null = null;

  if (employeeId) {
    const { data, error } = await supabase
      .from("employees")
      .select("full_name, email, role, avatar_url, branch_id, must_change_password, password_changed_at, branch:branches(name)")
      .eq("id", employeeId)
      .maybeSingle();

    if (error) {
      console.error("[auth/sesion] No se pudo leer el perfil del empleado", {
        message: error.message,
        code: error.code,
        employeeId,
      });
      return NextResponse.json(
        { error: "No se pudo cargar el perfil del usuario." },
        { status: 500 },
      );
    }

    employee = data;
  }

  const branch = Array.isArray(employee?.branch) ? employee?.branch[0] ?? null : employee?.branch ?? null;
  const metadata = userData.user.user_metadata ?? {};
  const email = employee?.email ?? userData.user.email ?? null;
  const fullName =
    employee?.full_name ??
    (typeof metadata.full_name === "string" ? metadata.full_name : null) ??
    (typeof metadata.name === "string" ? metadata.name : null) ??
    email;

  return NextResponse.json({
    data: {
      email,
      fullName,
      role: (role as string | null) ?? employee?.role ?? null,
      roleLabel: getRoleLabel((role as string | null) ?? employee?.role ?? null),
      branchName: branch?.name ?? null,
      branchId: employee?.branch_id ?? null,
      avatarUrl: employee?.avatar_url ?? null,
      sessionStatusLabel: "Sesion activa",
      mustChangePassword: employee?.must_change_password ?? false,
      passwordChangedAt: employee?.password_changed_at ?? null,
    },
  });
}
