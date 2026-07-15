import { NextResponse } from "next/server";

import {
  isValidCashMovementStatus,
  isValidCashMovementType,
  isValidIsoDate,
  toMoneyNumber,
  trimOrNull,
} from "@/app/api/admin/cash/route-helpers";
import { createClient } from "@/lib/supabase/server";
import { resolveOperationalBranchScope } from "@/lib/operational/branch-scope";

type EmployeeRow = {
  id: string;
  branch_id: string | null;
  full_name: string;
  role: "owner" | "admin" | "reception" | "barber" | "viewer";
  status: "active" | "inactive" | "blocked";
};

type BranchRow = {
  id: string;
  code: string | null;
  name: string;
  slug: string;
  short_name: string | null;
  is_active: boolean;
};

type SessionRow = {
  id: string;
  branch_id: string;
  business_date: string;
  status: "open" | "closed";
  opening_cash_amount: number | string;
  expected_cash_amount: number | string;
  total_sales_amount: number | string;
  total_cash_amount: number | string;
  opened_at: string;
  opening_notes: string | null;
  branch?: { name: string | null; code: string | null; slug: string | null }[] | { name: string | null; code: string | null; slug: string | null } | null;
  opened_by_employee?: { id: string | null; full_name: string | null }[] | { id: string | null; full_name: string | null } | null;
};

type CategoryRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  movement_direction: "income" | "expense" | "adjustment";
  sort_order: number;
  is_active: boolean;
};

type MovementRow = {
  id: string;
  pos_session_id: string;
  branch_id: string;
  category_id: string | null;
  movement_type: "income" | "expense" | "adjustment";
  amount: number | string;
  description: string;
  evidence_url: string | null;
  status: "active" | "cancelled";
  created_by: string | null;
  cancelled_by: string | null;
  cancelled_reason: string | null;
  created_at: string;
  cancelled_at: string | null;
  updated_at: string;
  category?: {
    name: string | null;
    code: string | null;
    movement_direction: "income" | "expense" | "adjustment" | null;
  }[] | {
    name: string | null;
    code: string | null;
    movement_direction: "income" | "expense" | "adjustment" | null;
  } | null;
  created_by_employee?: { full_name: string | null }[] | { full_name: string | null } | null;
  cancelled_by_employee?: { full_name: string | null }[] | { full_name: string | null } | null;
};

function unwrapRelation<T>(value: T[] | T | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function buildDayRange(date: string | null) {
  if (!isValidIsoDate(date)) {
    return null;
  }

  return {
    start: `${date}T00:00:00`,
    end: `${date}T23:59:59.999`,
  };
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const requestedBranchId = trimOrNull(searchParams.get("branchId"));
  const date = trimOrNull(searchParams.get("date"));
  const movementType = trimOrNull(searchParams.get("movementType"));
  const status = trimOrNull(searchParams.get("status"));
  const categoryId = trimOrNull(searchParams.get("categoryId"));

  const { data: role, error: roleError } = await supabase.rpc("current_user_role");
  if (roleError || !role) {
    console.error("[cash/bootstrap] No se pudo leer el rol actual", {
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
      { error: "No tienes permiso para acceder a este modulo." },
      { status: 403 },
    );
  }

  const currentEmployeeIdResult = await supabase.rpc("current_employee_id");
  const currentEmployeeId = currentEmployeeIdResult.data ?? "";

  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("id, branch_id, full_name, role, status")
    .eq("id", currentEmployeeId)
    .maybeSingle();

  if (employeeError) {
    console.error("[cash/bootstrap] No se pudo leer el empleado actual", {
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
    console.error("[cash/bootstrap] No se pudieron cargar las sedes", {
      message: branchesError.message,
      code: branchesError.code,
    });
    return NextResponse.json(
      { error: "No se pudieron cargar las sedes disponibles." },
      { status: 500 },
    );
  }

  const availableBranches = (branches ?? []) as BranchRow[];
  const requestedAccessibleBranchId = requestedBranchId && availableBranches.some((branch) => branch.id === requestedBranchId)
    ? requestedBranchId
    : null;
  const scope = resolveOperationalBranchScope(role, employee, requestedAccessibleBranchId);
  const selectedBranchId = scope.branchId ?? availableBranches[0]?.id ?? "";

  let sessionsQuery = supabase
    .from("pos_sessions")
    .select(
      "id, branch_id, business_date, status, opening_cash_amount, expected_cash_amount, total_sales_amount, total_cash_amount, opened_at, opening_notes, branch:branches(name, code, slug), opened_by_employee:employees!pos_sessions_opened_by_fkey(id, full_name)",
    )
    .eq("status", "open")
    .order("opened_at", { ascending: false });

  if (role === "reception" && employee?.branch_id) {
    sessionsQuery = sessionsQuery.eq("branch_id", employee.branch_id);
  }

  const { data: sessions, error: sessionsError } = await sessionsQuery;

  if (sessionsError) {
    console.error("[cash/bootstrap] No se pudieron cargar las sesiones POS", {
      message: sessionsError.message,
      code: sessionsError.code,
    });
    return NextResponse.json(
      { error: "No se pudieron cargar las sesiones POS." },
      { status: 500 },
    );
  }

  const openSessions = ((sessions ?? []) as SessionRow[]).map((session) => {
    const branch = unwrapRelation(session.branch);
    const openedBy = unwrapRelation(session.opened_by_employee);

    return {
      id: session.id,
      branch_id: session.branch_id,
      branch_name: branch?.name ?? null,
      branch_code: branch?.code ?? null,
      branch_slug: branch?.slug ?? null,
      business_date: session.business_date,
      status: session.status,
      opening_cash_amount: toMoneyNumber(session.opening_cash_amount).toFixed(2),
      expected_cash_amount: toMoneyNumber(session.expected_cash_amount).toFixed(2),
      total_sales_amount: toMoneyNumber(session.total_sales_amount).toFixed(2),
      total_cash_amount: toMoneyNumber(session.total_cash_amount).toFixed(2),
      opened_at: session.opened_at,
      opening_notes: session.opening_notes,
      opened_by: openedBy?.id ?? null,
      opened_by_name: openedBy?.full_name ?? null,
    };
  });

  const activeSession = openSessions.find((session) => session.branch_id === selectedBranchId) ?? null;

  const { data: categories, error: categoriesError } = await supabase
    .from("cash_movement_categories")
    .select("id, code, name, description, movement_direction, sort_order, is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (categoriesError) {
    console.error("[cash-categories/get] Error", {
      message: categoriesError.message,
      code: categoriesError.code,
      details: categoriesError.details,
      hint: categoriesError.hint,
      movementType,
    });
    return NextResponse.json(
      { error: "No se pudieron cargar las categorias de caja." },
      { status: 500 },
    );
  }

  if (activeSession) {
    const { error: syncError } = await supabase.rpc("sync_pos_session_totals", {
      p_session_id: activeSession.id,
    });

    if (syncError) {
      console.error("[cash/bootstrap] No se pudo sincronizar la sesion POS", {
        message: syncError.message,
        code: syncError.code,
        details: syncError.details,
        hint: syncError.hint,
        sessionId: activeSession.id,
      });
    }
  }

  const range = buildDayRange(date);

  let movementsQuery = supabase
    .from("cash_movements")
    .select(
      "id, pos_session_id, branch_id, category_id, movement_type, amount, description, evidence_url, status, created_by, cancelled_by, cancelled_reason, created_at, cancelled_at, updated_at, category:cash_movement_categories(name, code, movement_direction), created_by_employee:employees!cash_movements_created_by_fkey(full_name), cancelled_by_employee:employees!cash_movements_cancelled_by_fkey(full_name)",
    )
    .eq("branch_id", selectedBranchId)
    .order("created_at", { ascending: false });

  if (movementType === "withdrawal") {
    movementsQuery = movementsQuery.eq("movement_type", "expense");
  } else if (isValidCashMovementType(movementType)) {
    movementsQuery = movementsQuery.eq("movement_type", movementType);
  }

  if (isValidCashMovementStatus(status)) {
    movementsQuery = movementsQuery.eq("status", status);
  }

  if (categoryId) {
    movementsQuery = movementsQuery.eq("category_id", categoryId);
  }

  if (range) {
    movementsQuery = movementsQuery.gte("created_at", range.start).lte("created_at", range.end);
  }

  const [movementsResult, summaryMovementsResult] = await Promise.all([
    movementsQuery,
    supabase
      .from("cash_movements")
      .select("movement_type, amount, status, category:cash_movement_categories(code)")
      .eq("branch_id", selectedBranchId)
      .eq("status", "active"),
  ]);

  if (movementsResult.error || summaryMovementsResult.error) {
    console.error("[cash/bootstrap] No se pudieron cargar los movimientos", {
      message: movementsResult.error?.message ?? summaryMovementsResult.error?.message,
      code: movementsResult.error?.code ?? summaryMovementsResult.error?.code,
      details: movementsResult.error?.details ?? summaryMovementsResult.error?.details,
      hint: movementsResult.error?.hint ?? summaryMovementsResult.error?.hint,
      branchId: selectedBranchId,
    });
    return NextResponse.json(
      { error: "No se pudieron cargar los movimientos de caja." },
      { status: 500 },
    );
  }

  const summary = ((summaryMovementsResult.data ?? []) as Array<{
    movement_type: "income" | "expense" | "adjustment";
    amount: number | string;
    status: "active";
    category?: { code: string | null }[] | { code: string | null } | null;
  }>).reduce(
    (accumulator, item) => {
      const amount = toMoneyNumber(item.amount);

      if (item.movement_type === "income") {
        accumulator.operationalIncome += amount;
      } else if (item.movement_type === "expense") {
        if (unwrapRelation(item.category)?.code === "cash_withdrawal") {
          accumulator.withdrawals += amount;
        } else {
          accumulator.operationalExpense += amount;
        }
      } else if (item.movement_type === "adjustment") {
        accumulator.adjustments += amount;
      }

      return accumulator;
    },
    {
      operationalIncome: 0,
      operationalExpense: 0,
      withdrawals: 0,
      adjustments: 0,
    },
  );

  return NextResponse.json({
    role,
    employee: (employee as EmployeeRow | null) ?? null,
    branches: availableBranches,
    selectedBranchId,
    openSessions,
    activeSession,
    categories: (categories ?? []) as CategoryRow[],
    summary: {
      branchId: selectedBranchId,
      branchName: availableBranches.find((branch) => branch.id === selectedBranchId)?.name ?? null,
      sessionId: activeSession?.id ?? null,
      status: activeSession?.status ?? null,
      openingCashAmount: Number(activeSession?.opening_cash_amount ?? 0),
      cashSalesAmount: Number(activeSession?.total_cash_amount ?? 0),
      operationalIncome: Number(summary.operationalIncome.toFixed(2)),
      operationalExpense: Number(summary.operationalExpense.toFixed(2)),
      withdrawals: Number(summary.withdrawals.toFixed(2)),
      adjustments: Number(summary.adjustments.toFixed(2)),
      netOperationalAmount: Number((summary.operationalIncome - summary.operationalExpense - summary.withdrawals + summary.adjustments).toFixed(2)),
      expectedCashAmount: Number(activeSession?.expected_cash_amount ?? 0),
      totalSalesAmount: Number(activeSession?.total_sales_amount ?? 0),
      openedAt: activeSession?.opened_at ?? null,
      openedByName: activeSession?.opened_by_name ?? null,
    },
    movements: ((movementsResult.data ?? []) as MovementRow[]).filter((movement) => {
      const category = unwrapRelation(movement.category);
      if (movementType === "withdrawal") return category?.code === "cash_withdrawal";
      if (movementType === "expense") return category?.code !== "cash_withdrawal";
      return true;
    }).map((movement) => {
      const category = unwrapRelation(movement.category);
      const createdBy = unwrapRelation(movement.created_by_employee);
      const cancelledBy = unwrapRelation(movement.cancelled_by_employee);

      return {
        id: movement.id,
        pos_session_id: movement.pos_session_id,
        branch_id: movement.branch_id,
        category_id: movement.category_id,
        movement_type: movement.movement_type,
        amount: toMoneyNumber(movement.amount).toFixed(2),
        description: movement.description,
        evidence_url: movement.evidence_url,
        status: movement.status,
        created_by: movement.created_by,
        created_by_name: createdBy?.full_name ?? null,
        cancelled_by: movement.cancelled_by,
        cancelled_by_name: cancelledBy?.full_name ?? null,
        cancelled_reason: movement.cancelled_reason,
        created_at: movement.created_at,
        cancelled_at: movement.cancelled_at,
        updated_at: movement.updated_at,
        category_name: category?.name ?? null,
        category_code: category?.code ?? null,
        category_direction: category?.movement_direction ?? null,
      };
    }),
  });
}
