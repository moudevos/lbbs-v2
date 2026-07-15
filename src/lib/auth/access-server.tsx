import "server-only";

import type { ReactNode } from "react";

import type { AppModule, AppRole } from "@/lib/auth/module-permissions";
import { canAccessModule } from "@/lib/auth/module-permissions";
import { createClient } from "@/lib/supabase/server";

export type AccessContext = {
  userId: string;
  role: AppRole;
  employeeId: string | null;
  branchId: string | null;
  mustChangePassword: boolean;
};

export async function getAccessContext(): Promise<AccessContext | null> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return null;
  }

  const { data: role, error: roleError } = await supabase.rpc("current_user_role");
  if (roleError || !role) {
    return null;
  }

  const { data: employeeId } = await supabase.rpc("current_employee_id");
  let branchId: string | null = null;

  if (employeeId) {
    const { data: employee } = await supabase
      .from("employees")
      .select("branch_id, must_change_password")
      .eq("id", employeeId)
      .maybeSingle();

    branchId = employee?.branch_id ?? null;
    return {
      userId: userData.user.id,
      role: role as AppRole,
      employeeId,
      branchId,
      mustChangePassword: employee?.must_change_password ?? false,
    };
  }

  return {
    userId: userData.user.id,
    role: role as AppRole,
    employeeId: employeeId ?? null,
    branchId,
    mustChangePassword: false,
  };
}

export async function getModuleAccess(module: AppModule) {
  const context = await getAccessContext();

  if (!context) {
    return {
      allowed: false,
      message: "No tienes permiso para acceder a este modulo.",
      context: null,
    };
  }

  if (!canAccessModule(context.role, module)) {
    return {
      allowed: false,
      message: "No tienes permiso para acceder a este modulo.",
      context,
    };
  }

  return {
    allowed: true,
    message: null,
    context,
  };
}

export function renderModuleAccessDenied(message = "No tienes permiso para acceder a este modulo.") {
  return (
    <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-lg font-semibold text-slate-900">Acceso restringido</p>
      <p className="mt-2 text-sm text-slate-600">{message}</p>
    </section>
  ) satisfies ReactNode;
}
