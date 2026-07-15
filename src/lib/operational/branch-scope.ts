import "server-only";

export type OperationalRole = "owner" | "admin" | "reception" | "barber" | "viewer";

type OperationalEmployee = { branch_id: string | null } | null;

export function resolveOperationalBranchScope(
  role: OperationalRole,
  currentEmployee: OperationalEmployee,
  requestedBranchId: string | null,
) {
  if (role === "owner" || role === "admin") {
    return { branchId: requestedBranchId, isGlobal: requestedBranchId === null };
  }

  if (role === "reception") {
    return { branchId: currentEmployee?.branch_id ?? null, isGlobal: false };
  }

  return { branchId: currentEmployee?.branch_id ?? null, isGlobal: false };
}
