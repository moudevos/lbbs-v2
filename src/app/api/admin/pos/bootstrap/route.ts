import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { resolveOperationalBranchScope } from "@/lib/operational/branch-scope";

function trimOrNull(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

type SessionRow = {
  id: string;
  branch_id: string;
  business_date: string;
  status: "open" | "pending_close" | "closed" | "cancelled";
  opening_cash_amount: number | string;
  total_sales_amount: number | string;
  opened_at: string;
  opening_notes: string | null;
  branch?: { name: string | null; code: string | null; slug: string | null }[] | { name: string | null; code: string | null; slug: string | null } | null;
  opened_by_employee?: { id: string | null; full_name: string | null }[] | { id: string | null; full_name: string | null } | null;
};

export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const requestedBranchId = trimOrNull(searchParams.get("branchId"));
  const requestedSessionId = trimOrNull(searchParams.get("sessionId"));
  const requestedReservationId = trimOrNull(searchParams.get("reservationId"));

  const { error: overdueError } = await supabase.rpc("mark_overdue_pos_sessions");
  if (overdueError && overdueError.code !== "PGRST202") {
    console.error("[pos/bootstrap] No se pudieron marcar sesiones vencidas", {
      message: overdueError.message,
      code: overdueError.code,
    });
  }

  const { data: role, error: roleError } = await supabase.rpc("current_user_role");
  if (roleError || !role) {
    console.error("[pos/bootstrap] No se pudo leer el rol actual", {
      message: roleError?.message,
      code: roleError?.code,
    });
    return NextResponse.json(
      { error: "No se pudo validar la sesion actual." },
      { status: 500 },
    );
  }

  if (role !== "owner" && role !== "admin" && role !== "reception") {
    return NextResponse.json(
      { error: "No tienes permiso para usar el modulo POS." },
      { status: 403 },
    );
  }

  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("id, branch_id, full_name, role, status")
    .eq("id", (await supabase.rpc("current_employee_id")).data ?? "")
    .maybeSingle();

  if (employeeError) {
    console.error("[pos/bootstrap] No se pudo leer el empleado actual", {
      message: employeeError.message,
      code: employeeError.code,
    });
    return NextResponse.json(
      { error: "No se pudo cargar el empleado actual." },
      { status: 500 },
    );
  }

  let branchesQuery = supabase
    .from("branches")
    .select("id, code, name, slug, short_name, is_active")
    .order("name", { ascending: true });

  if (role === "reception" && employee?.branch_id) {
    branchesQuery = branchesQuery.eq("id", employee.branch_id);
  }

  const { data: branches, error: branchesError } = await branchesQuery;

  if (branchesError) {
    console.error("[pos/bootstrap] No se pudieron cargar las sedes", {
      message: branchesError.message,
      code: branchesError.code,
    });
    return NextResponse.json(
      { error: "No se pudieron cargar las sedes disponibles." },
      { status: 500 },
    );
  }

  let sessionsQuery = supabase
    .from("pos_sessions")
    .select(
      "id, branch_id, business_date, status, opening_cash_amount, total_sales_amount, opened_at, opening_notes, branch:branches(name, code, slug), opened_by_employee:employees!pos_sessions_opened_by_fkey(id, full_name)",
    )
    .in("status", ["open", "pending_close"])
    .order("opened_at", { ascending: false });

  if (role === "reception" && employee?.branch_id) {
    sessionsQuery = sessionsQuery.eq("branch_id", employee.branch_id);
  }

  const { data: openSessions, error: sessionsError } = await sessionsQuery;

  if (sessionsError) {
    console.error("[pos/bootstrap] No se pudieron cargar las sesiones POS", {
      message: sessionsError.message,
      code: sessionsError.code,
    });
    return NextResponse.json(
      { error: "No se pudieron cargar las sesiones POS." },
      { status: 500 },
    );
  }

  const formattedSessions = (openSessions ?? []).map((session: SessionRow) => {
    const branch = Array.isArray(session.branch) ? session.branch[0] ?? null : session.branch ?? null;
    const openedBy = Array.isArray(session.opened_by_employee)
      ? session.opened_by_employee[0] ?? null
      : session.opened_by_employee ?? null;

    return {
      id: session.id,
      branch_id: session.branch_id,
      branch_name: branch?.name ?? null,
      branch_code: branch?.code ?? null,
      branch_slug: branch?.slug ?? null,
      status: session.status,
      business_date: session.business_date,
      opening_cash_amount: typeof session.opening_cash_amount === "number"
        ? session.opening_cash_amount.toFixed(2)
        : String(session.opening_cash_amount),
      total_sales_amount: typeof session.total_sales_amount === "number"
        ? session.total_sales_amount.toFixed(2)
        : String(session.total_sales_amount),
      opened_at: session.opened_at,
      opened_by: openedBy?.id ?? null,
      opened_by_name: openedBy?.full_name ?? null,
      opening_notes: session.opening_notes,
    };
  });

  const requestedSession = requestedSessionId
    ? formattedSessions.find((session) => session.id === requestedSessionId) ?? null
    : null;

  if (requestedSessionId && !requestedSession) {
    return NextResponse.json(
      { error: "No tienes permiso para acceder a esa sesion POS." },
      { status: 403 },
    );
  }

  const scope = resolveOperationalBranchScope(role, employee, requestedBranchId);
  const selectedBranchId = requestedSession?.branch_id ?? scope.branchId ?? "";

  const { data: paymentMethods, error: methodsError } = await supabase
    .from("payment_methods")
    .select("id, code, name, description, sort_order, is_active, payment_kind, allows_change, counts_as_cash")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (methodsError) {
    console.error("[pos/bootstrap] No se pudieron cargar los metodos de pago", {
      message: methodsError.message,
      code: methodsError.code,
    });
    return NextResponse.json(
      { error: "No se pudieron cargar los metodos de pago." },
      { status: 500 },
    );
  }

  const { data: courtesyReasons, error: courtesyReasonsError } = await supabase
    .from("courtesy_reasons")
    .select("id, code, name")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (courtesyReasonsError) {
    console.error("[pos/bootstrap] No se pudieron cargar los motivos de cortesia", {
      message: courtesyReasonsError.message,
      code: courtesyReasonsError.code,
    });
    return NextResponse.json(
      { error: "No se pudieron cargar los motivos de cortesia." },
      { status: 500 },
    );
  }

  const { data: customerVarious, error: customerError } = await supabase
    .from("customers")
    .select("id, full_name, phone, document_number, is_active")
    .or("phone_normalized.eq.000000000,full_name.ilike.Cliente varios")
    .limit(1)
    .maybeSingle();

  if (customerError) {
    console.error("[pos/bootstrap] No se pudo cargar Cliente varios", {
      message: customerError.message,
      code: customerError.code,
    });
    return NextResponse.json(
      { error: "No se pudo cargar el cliente por defecto." },
      { status: 500 },
    );
  }

  let reservationPrefill = null;
  if (requestedReservationId) {
    const { data: reservation, error: reservationError } = await supabase
      .from("reservations")
      .select("id, customer_id, branch_id, preferred_barber_id, service_interest_id, status, customer:customers(id,full_name,phone,document_number,is_active)")
      .eq("id", requestedReservationId)
      .eq("status", "checked_in")
      .maybeSingle();
    if (reservationError || !reservation || reservation.branch_id !== selectedBranchId) {
      console.error("[pos/bootstrap] No se pudo cargar la reserva para POS", { message: reservationError?.message, code: reservationError?.code, details: reservationError?.details, hint: reservationError?.hint, reservationId: requestedReservationId });
      return NextResponse.json({ error: "No se pudo usar la reserva seleccionada en POS." }, { status: 400 });
    }
    const reservationCustomer = Array.isArray(reservation.customer) ? reservation.customer[0] : reservation.customer;
    if (!reservationCustomer) return NextResponse.json({ error: "La reserva no tiene un cliente disponible." }, { status: 400 });
    reservationPrefill = { id: reservation.id, customer: reservationCustomer, branchId: reservation.branch_id, barberId: reservation.preferred_barber_id, serviceId: reservation.service_interest_id };
  }

  return NextResponse.json({
    role,
    employee: employee ?? null,
    branches: branches ?? [],
    selectedBranchId,
    openSessions: formattedSessions,
    activeSession:
      requestedSession ??
      formattedSessions.find((session) => session.branch_id === selectedBranchId) ??
      null,
    customerVarious: customerVarious ?? null,
    paymentMethods: paymentMethods ?? [],
    courtesyReasons: courtesyReasons ?? [],
    reservationPrefill,
  });
}
