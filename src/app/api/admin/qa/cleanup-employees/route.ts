import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/supabase/route-auth";

function qaWritesAreEnabled() {
  return (
    process.env.QA_ALLOW_WRITES === "true" &&
    process.env.QA_RESET_CONFIRMED === "true"
  );
}

export async function POST() {
  const auth = await requireAdminSession();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  if (auth.role !== "owner" || !qaWritesAreEnabled()) {
    return NextResponse.json({ error: "Recurso no disponible." }, { status: 404 });
  }

  const admin = getSupabaseAdmin();
  const { data: employees, error: readError } = await admin
    .from("employees")
    .select("id, user_id")
    .like("full_name", "QA_TEST_DATA%");

  if (readError) {
    console.error("[qa/cleanup] No se pudieron leer los empleados QA", {
      message: readError.message,
      code: readError.code,
    });
    return NextResponse.json({ error: "No se pudieron limpiar los empleados QA." }, { status: 500 });
  }

  const rows = employees ?? [];
  const authUserIds = rows.flatMap((employee) => (employee.user_id ? [employee.user_id] : []));

  for (const userId of authUserIds) {
    const { error } = await admin.auth.admin.deleteUser(userId);

    if (error) {
      console.error("[qa/cleanup] No se pudo eliminar un usuario Auth QA", {
        message: error.message,
        code: error.code,
      });
      return NextResponse.json({ error: "No se pudieron limpiar los accesos QA." }, { status: 500 });
    }
  }

  const employeeIds = rows.filter((employee) => !employee.user_id).map((employee) => employee.id);

  if (employeeIds.length > 0) {
    const { error } = await admin.from("employees").delete().in("id", employeeIds);

    if (error) {
      console.error("[qa/cleanup] No se pudieron eliminar los empleados QA", {
        message: error.message,
        code: error.code,
      });
      return NextResponse.json({ error: "No se pudieron limpiar los empleados QA." }, { status: 500 });
    }
  }

  const { data: branches, error: branchReadError } = await admin
    .from("branches")
    .select("id")
    .like("name", "QA_TEST_DATA%");

  if (branchReadError) {
    console.error("[qa/cleanup] No se pudieron leer las sedes QA", {
      message: branchReadError.message,
      code: branchReadError.code,
    });
    return NextResponse.json({ error: "No se pudieron limpiar las sedes QA." }, { status: 500 });
  }

  const branchIds = (branches ?? []).map((branch) => branch.id);

  if (branchIds.length > 0) {
    const { error } = await admin.from("branches").delete().in("id", branchIds);

    if (error) {
      console.error("[qa/cleanup] No se pudieron eliminar las sedes QA", {
        message: error.message,
        code: error.code,
      });
      return NextResponse.json({ error: "No se pudieron limpiar las sedes QA." }, { status: 500 });
    }
  }

  return NextResponse.json({ deletedEmployees: rows.length, deletedBranches: branchIds.length });
}
