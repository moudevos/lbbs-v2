import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
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

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminSession();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id } = await params;
  const payload = await request.json().catch(() => null);
  const fullName = trimOrNull(payload?.full_name);
  const email = trimOrNull(payload?.email);

  if (!fullName || !email) {
    return NextResponse.json(
      { error: "Nombre y email son obligatorios." },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdmin();
  const { data: existing, error: readError } = await admin
    .from("employees")
    .select("id, user_id, email")
    .eq("id", id)
    .maybeSingle();

  if (readError) {
    console.error("[employees/put] No se pudo leer el empleado", {
      message: readError.message,
      code: readError.code,
      employeeId: id,
    });
    return NextResponse.json(
      { error: "No se pudo leer el empleado." },
      { status: 500 },
    );
  }

  if (!existing) {
    return NextResponse.json({ error: "Empleado no encontrado." }, { status: 404 });
  }

  const nextStatus = payload?.status ?? "active";
  const nextRole = payload?.role ?? "viewer";
  const previousEmail = existing.email;
  const authEmailChanged = existing.user_id && email !== existing.email;

  if (authEmailChanged) {
    const authUpdate = await admin.auth.admin.updateUserById(existing.user_id, {
      email,
    });

    if (authUpdate.error) {
      console.error("[employees/put] No se pudo actualizar el usuario Auth", {
        message: authUpdate.error.message,
        code: authUpdate.error.code,
        employeeId: id,
        userId: existing.user_id,
      });
      return NextResponse.json(
        { error: authUpdate.error.message || "No se pudo actualizar el usuario Auth." },
        { status: 400 },
      );
    }
  }

  const { data, error } = await admin
    .from("employees")
    .update({
      branch_id: trimOrNull(payload?.branch_id),
      full_name: fullName,
      document_type: trimOrNull(payload?.document_type),
      document_number: trimOrNull(payload?.document_number),
      email,
      phone: trimOrNull(payload?.phone),
      role: nextRole,
      status: nextStatus,
      position: trimOrNull(payload?.position),
      avatar_url: trimOrNull(payload?.avatar_url),
      notes: trimOrNull(payload?.notes),
    })
    .eq("id", id)
    .select(
      "id, user_id, branch_id, full_name, document_type, document_number, email, phone, role, status, position, avatar_url, must_change_password, can_login, login_created_at, notes, created_at, updated_at, branch:branches(id, name, slug, code)",
    )
    .single();

  if (error) {
    console.error("[employees/put] Error al actualizar empleado", {
      message: error.message,
      code: error.code,
      employeeId: id,
    });

    if (authEmailChanged && existing.user_id && previousEmail) {
      const rollback = await admin.auth.admin.updateUserById(existing.user_id, {
        email: previousEmail,
      });

      if (rollback.error) {
        console.error("[employees/put] No se pudo revertir el email de Auth", {
          message: rollback.error.message,
          code: rollback.error.code,
          employeeId: id,
          userId: existing.user_id,
        });
      }
    }

    return NextResponse.json(
      { error: error.message || "No se pudo actualizar el empleado." },
      { status: 400 },
    );
  }

  return NextResponse.json({ data: formatEmployee(data) });
}
