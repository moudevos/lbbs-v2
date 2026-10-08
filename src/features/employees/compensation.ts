export type EmployeeCompensationMode =
  | "commission"
  | "commission_plus_bonus"
  | "commission_only"
  | "fixed_plus_bonus"
  | "fixed";

export type EmployeeCompensationTerm = {
  id: string;
  employee_id: string;
  compensation_mode: EmployeeCompensationMode;
  commission_rate?: number | string | null;
  fixed_amount?: number | string | null;
  base_monthly_salary: number | string | null;
  mandatory_discount_enabled: boolean | null;
  mandatory_discount_rate: number | string | null;
  compensation_policy_version: number;
  effective_from: string;
  effective_to: string | null;
  created_at?: string;
};

export const compensationModeLabels: Record<EmployeeCompensationMode, string> = {
  commission: "Comisión (legado)",
  commission_plus_bonus: "Comisión + bonos",
  commission_only: "Solo comisiones",
  fixed_plus_bonus: "Fijo + bonos",
  fixed: "Solo fijo",
};

export function isCommissionCompensationMode(mode: string | null | undefined) {
  return mode === "commission" || mode === "commission_plus_bonus" || mode === "commission_only";
}

export function isFixedCompensationMode(mode: string | null | undefined) {
  return mode === "fixed_plus_bonus" || mode === "fixed";
}

export function isConfigurableCompensationMode(mode: string | null | undefined) {
  return mode === "commission_plus_bonus"
    || mode === "commission_only"
    || mode === "fixed_plus_bonus"
    || mode === "fixed";
}

export function resolveCompensationForDate(
  terms: EmployeeCompensationTerm[],
  employeeId: string,
  date: string,
) {
  return [...terms]
    .filter(
      (term) =>
        term.employee_id === employeeId
        && term.effective_from <= date
        && (!term.effective_to || term.effective_to >= date),
    )
    .sort((a, b) => {
      const byEffectiveFrom = b.effective_from.localeCompare(a.effective_from);
      if (byEffectiveFrom !== 0) return byEffectiveFrom;
      return (b.created_at ?? "").localeCompare(a.created_at ?? "");
    })[0] ?? null;
}

export function resolveCompensationForPeriod(
  terms: EmployeeCompensationTerm[],
  employeeId: string,
  periodStart: string,
  periodEnd: string,
) {
  return [...terms]
    .filter(
      (term) =>
        term.employee_id === employeeId
        && term.effective_from <= periodEnd
        && (!term.effective_to || term.effective_to >= periodStart),
    )
    .sort((a, b) => {
      const byEffectiveFrom = b.effective_from.localeCompare(a.effective_from);
      if (byEffectiveFrom !== 0) return byEffectiveFrom;
      return (b.created_at ?? "").localeCompare(a.created_at ?? "");
    })[0] ?? null;
}
