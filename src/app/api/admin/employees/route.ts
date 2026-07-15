import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/supabase/route-auth";

function trimOrNull(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

type EmployeeBranch = {
  name: string | null;
  slug: string | null;
  code: string | null;
} | null;

type EmployeeRow = {
  id: string;
  user_id: string | null;
  branch_id: string | null;
  full_name: string;
  document_type: string | null;
  document_number: string | null;
  email: string | null;
  phone: string | null;
  role: "owner" | "admin" | "reception" | "barber" | "viewer";
  status: "active" | "inactive" | "blocked";
  position: string | null;
  avatar_url: string | null;
  must_change_password: boolean;
  can_login: boolean;
  login_created_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  branch?: EmployeeBranch[] | EmployeeBranch;
};

function formatEmployee(employee: EmployeeRow) {
  const branch = Array.isArray(employee.branch)
    ? employee.branch[0] ?? null
    : employee.branch ?? null;

  return {
    id: employee.id,
    user_id: employee.user_id,
    branch_id: employee.branch_id,
    full_name: employee.full_name,
    document_type: employee.document_type,
    document_number: employee.document_number,
    email: employee.email,
    phone: employee.phone,
    role: employee.role,
    status: employee.status,
    position: employee.position,
    avatar_url: employee.avatar_url,
    must_change_password: employee.must_change_password,
    can_login: employee.can_login,
    login_created_at: employee.login_created_at,
    notes: employee.notes,
    created_at: employee.created_at,
    updated_at: employee.updated_at,
    branch_name: branch?.name ?? null,
    branch_slug: branch?.slug ?? null,
    branch_code: branch?.code ?? null,
  };
}

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select(
      "id, user_id, branch_id, full_name, document_type, document_number, email, phone, role, status, position, avatar_url, must_change_password, can_login, login_created_at, notes, created_at, updated_at, branch:branches(id, name, slug, code)",
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[employees/get] Error al listar equipo", {
      message: error.message,
      code: error.code,
    });
    return NextResponse.json(
      { error: "No se pudo cargar el equipo." },
      { status: 500 },
    );
  }

  return NextResponse.json({ data: (data ?? []).map(formatEmployee) });
}

export async function POST(request: Request) {
  const auth = await requireAdminSession();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const payload = await request.json().catch(() => null);
  const fullName = trimOrNull(payload?.full_name);
  const email = trimOrNull(payload?.email);
  const canLogin = Boolean(payload?.can_login);
  const temporaryPassword = trimOrNull(payload?.temporary_password);

  if (!fullName || !email) {
    return NextResponse.json(
      { error: "Nombre y email son obligatorios." },
      { status: 400 },
    );
  }

  if (canLogin && !temporaryPassword) {
    return NextResponse.json(
      { error: "La contrasena temporal es obligatoria cuando el empleado tendra acceso." },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdmin();
  let userId: string | null = null;
  let loginCreatedAt: string | null = null;

  if (canLogin) {
    const authResult = await admin.auth.admin.createUser({
      email,
      password: temporaryPassword ?? undefined,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
      },
    });

    if (authResult.error || !authResult.data.user) {
      console.error("[employees/post] Error al crear usuario Auth", {
        message: authResult.error?.message,
        code: authResult.error?.code,
        email,
      });
      return NextResponse.json(
        { error: authResult.error?.message || "No se pudo crear el usuario Auth." },
        { status: 400 },
      );
    }

    userId = authResult.data.user.id;
    loginCreatedAt = new Date().toISOString();
  }

  const { data, error } = await admin
    .from("employees")
    .insert({
      user_id: userId,
      branch_id: trimOrNull(payload?.branch_id),
      full_name: fullName,
      document_type: trimOrNull(payload?.document_type),
      document_number: trimOrNull(payload?.document_number),
      email,
      phone: trimOrNull(payload?.phone),
      role: payload?.role ?? "viewer",
      status: payload?.status ?? "active",
      position: trimOrNull(payload?.position),
      avatar_url: trimOrNull(payload?.avatar_url),
      can_login: canLogin,
      login_created_at: loginCreatedAt,
      must_change_password: true,
      notes: trimOrNull(payload?.notes),
    })
    .select(
      "id, user_id, branch_id, full_name, document_type, document_number, email, phone, role, status, position, avatar_url, must_change_password, can_login, login_created_at, notes, created_at, updated_at, branch:branches(id, name, slug, code)",
    )
    .single();

  if (error) {
    console.error("[employees/post] Error al crear perfil", {
      message: error.message,
      code: error.code,
      email,
      userId,
    });

    if (userId) {
      const cleanup = await admin.auth.admin.deleteUser(userId);
      if (cleanup.error) {
        console.error("[employees/post] No se pudo limpiar el usuario Auth", {
          message: cleanup.error.message,
          code: cleanup.error.code,
          userId,
        });
      }
    }

    return NextResponse.json(
      { error: error.message || "No se pudo crear el perfil del empleado." },
      { status: 400 },
    );
  }

  return NextResponse.json({ data: formatEmployee(data) });
}
