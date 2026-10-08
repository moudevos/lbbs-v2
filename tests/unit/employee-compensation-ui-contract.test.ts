import { describe, expect, it } from "vitest";

import {
  compensationModeLabels,
  isCommissionCompensationMode,
  isFixedCompensationMode,
  resolveCompensationForDate,
  resolveCompensationForPeriod,
  type EmployeeCompensationTerm,
} from "@/features/employees/compensation";

const terms: EmployeeCompensationTerm[] = [
  {
    id: "old",
    employee_id: "employee-1",
    compensation_mode: "commission_plus_bonus",
    base_monthly_salary: null,
    mandatory_discount_enabled: true,
    mandatory_discount_rate: 1,
    compensation_policy_version: 2,
    effective_from: "2026-09-01",
    effective_to: "2026-09-30",
  },
  {
    id: "current",
    employee_id: "employee-1",
    compensation_mode: "fixed_plus_bonus",
    base_monthly_salary: 1500,
    mandatory_discount_enabled: true,
    mandatory_discount_rate: 1,
    compensation_policy_version: 2,
    effective_from: "2026-10-01",
    effective_to: null,
  },
];

describe("resolución visual de remuneración", () => {
  it("carga la condición vigente real del empleado en lugar de un default", () => {
    expect(resolveCompensationForDate(terms, "employee-1", "2026-10-08")?.id).toBe("current");
    expect(resolveCompensationForDate(terms, "employee-1", "2026-09-15")?.id).toBe("old");
  });

  it("resuelve la condición aplicable al período con la misma precedencia temporal", () => {
    expect(resolveCompensationForPeriod(terms, "employee-1", "2026-10-01", "2026-10-15")?.id).toBe("current");
    expect(resolveCompensationForPeriod(terms, "employee-1", "2026-09-01", "2026-09-15")?.id).toBe("old");
  });

  it("distingue comisión y fijo para adaptar el modal de liquidación", () => {
    expect(isCommissionCompensationMode("commission_plus_bonus")).toBe(true);
    expect(isCommissionCompensationMode("commission_only")).toBe(true);
    expect(isFixedCompensationMode("fixed_plus_bonus")).toBe(true);
    expect(isFixedCompensationMode("fixed")).toBe(true);
    expect(compensationModeLabels.fixed).toBe("Solo fijo");
  });
});
