import "server-only";

import { createClient } from "@/lib/supabase/server";

type AdminCheckResult =
  | {
      ok: true;
      userId: string;
      role: string;
    }
  | {
      ok: false;
      status: number;
      message: string;
    };

export async function requireAdminSession(): Promise<AdminCheckResult> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    console.error("[auth/permisos] No se pudo leer la sesion", {
      message: userError.message,
      status: userError.status,
    });
    return {
      ok: false,
      status: 401,
      message: "No se pudo validar la sesion.",
    };
  }

  if (!userData.user) {
    return {
      ok: false,
      status: 401,
      message: "Sesion no iniciada.",
    };
  }

  const { data: role, error: roleError } = await supabase.rpc("current_user_role");

  if (roleError) {
    console.error("[auth/permisos] No se pudo leer el rol actual", {
      message: roleError.message,
      code: roleError.code,
    });
    return {
      ok: false,
      status: 500,
      message: "No se pudo validar permisos.",
    };
  }

  if (role !== "owner" && role !== "admin") {
    return {
      ok: false,
      status: 403,
      message: "Permisos insuficientes.",
    };
  }

  return {
    ok: true,
    userId: userData.user.id,
    role,
  };
}

type CustomerWriteCheckResult =
  | {
      ok: true;
      userId: string;
      role: string;
    }
  | {
      ok: false;
      status: number;
      message: string;
    };

export async function requireCustomerWriteSession(): Promise<CustomerWriteCheckResult> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    console.error("[auth/clientes] No se pudo leer la sesion", {
      message: userError.message,
      status: userError.status,
    });
    return {
      ok: false,
      status: 401,
      message: "No se pudo validar la sesion.",
    };
  }

  if (!userData.user) {
    return {
      ok: false,
      status: 401,
      message: "Sesion no iniciada.",
    };
  }

  const { data: role, error: roleError } = await supabase.rpc("current_user_role");

  if (roleError) {
    console.error("[auth/clientes] No se pudo leer el rol actual", {
      message: roleError.message,
      code: roleError.code,
    });
    return {
      ok: false,
      status: 500,
      message: "No se pudo validar permisos.",
    };
  }

  if (role !== "owner" && role !== "admin" && role !== "reception") {
    return {
      ok: false,
      status: 403,
      message: "Permisos insuficientes.",
    };
  }

  return {
    ok: true,
    userId: userData.user.id,
    role,
  };
}

type ReservationWriteCheckResult =
  | {
      ok: true;
      userId: string;
      role: string;
    }
  | {
      ok: false;
      status: number;
      message: string;
    };

export async function requireReservationWriteSession(): Promise<ReservationWriteCheckResult> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    console.error("[auth/reservas] No se pudo leer la sesion", {
      message: userError.message,
      status: userError.status,
    });
    return {
      ok: false,
      status: 401,
      message: "No se pudo validar la sesion.",
    };
  }

  if (!userData.user) {
    return {
      ok: false,
      status: 401,
      message: "Sesion no iniciada.",
    };
  }

  const { data: role, error: roleError } = await supabase.rpc("current_user_role");

  if (roleError) {
    console.error("[auth/reservas] No se pudo leer el rol actual", {
      message: roleError.message,
      code: roleError.code,
    });
    return {
      ok: false,
      status: 500,
      message: "No se pudo validar permisos.",
    };
  }

  if (role !== "owner" && role !== "admin" && role !== "reception") {
    return {
      ok: false,
      status: 403,
      message: "Permisos insuficientes.",
    };
  }

  return {
    ok: true,
    userId: userData.user.id,
    role,
  };
}

export async function requirePosWriteSession(): Promise<ReservationWriteCheckResult> {
  return requireReservationWriteSession();
}

export async function requireCashWriteSession(): Promise<ReservationWriteCheckResult> {
  return requireReservationWriteSession();
}

export async function requireRewardsWriteSession(): Promise<ReservationWriteCheckResult> {
  return requireReservationWriteSession();
}

type StockMovementCheckResult =
  | {
      ok: true;
      userId: string;
      role: string;
      employeeId: string | null;
    }
  | {
      ok: false;
      status: number;
      message: string;
    };

export async function requireStockMovementSession(): Promise<StockMovementCheckResult> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    console.error("[auth/stock] No se pudo leer la sesion", {
      message: userError.message,
      status: userError.status,
    });
    return {
      ok: false,
      status: 401,
      message: "No se pudo validar la sesion.",
    };
  }

  if (!userData.user) {
    return {
      ok: false,
      status: 401,
      message: "Sesion no iniciada.",
    };
  }

  const { data: role, error: roleError } = await supabase.rpc("current_user_role");

  if (roleError) {
    console.error("[auth/stock] No se pudo leer el rol actual", {
      message: roleError.message,
      code: roleError.code,
    });
    return {
      ok: false,
      status: 500,
      message: "No se pudo validar permisos.",
    };
  }

  if (role !== "owner" && role !== "admin" && role !== "reception") {
    return {
      ok: false,
      status: 403,
      message: "Permisos insuficientes.",
    };
  }

  const { data: employeeId, error: employeeError } = await supabase.rpc("current_employee_id");

  if (employeeError) {
    console.error("[auth/stock] No se pudo leer el empleado actual", {
      message: employeeError.message,
      code: employeeError.code,
    });
    return {
      ok: false,
      status: 500,
      message: "No se pudo validar el empleado actual.",
    };
  }

  return {
    ok: true,
    userId: userData.user.id,
    role,
    employeeId: employeeId ?? null,
  };
}
