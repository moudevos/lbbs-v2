import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = readFileSync(
  resolve(root, "supabase/migrations/20261008125500_enforce_unique_employee_settlement_per_period.sql"),
  "utf8",
);
const source = readFileSync(
  resolve(root, "src/sql/20261008125500_enforce_unique_employee_settlement_per_period.sql"),
  "utf8",
);
const route = readFileSync(
  resolve(root, "src/app/api/admin/settlements/route.ts"),
  "utf8",
);

describe("unicidad de liquidación por empleado y período", () => {
  it("mantiene migration y SQL fuente byte-identical", () => {
    expect(source).toBe(migration);
  });

  it("bloquea en base de datos cualquier liquidación no cancelada duplicada", () => {
    expect(migration).toContain(
      "employee_settlements_one_non_cancelled_employee_period",
    );
    expect(migration).toContain(
      "on public.employee_settlements(employee_id, payroll_period_id)",
    );
    expect(migration).toContain("where status <> 'cancelled'");
    expect(migration).toContain(
      "drop index if exists public.employee_settlements_one_active_employee_period",
    );
  });

  it("aborta la migración si ya existen duplicados no cancelados", () => {
    expect(migration).toContain("having count(*) > 1");
    expect(migration).toContain(
      "existen liquidaciones no canceladas duplicadas",
    );
  });

  it("la API considera paid como bloqueo del período", () => {
    expect(route).toContain('.neq("status", "cancelled")');
    expect(route).toContain("SETTLEMENT_ALREADY_PAID");
    expect(route).toContain(
      "El empleado ya tiene una liquidación pagada en este período",
    );
  });

  it("convierte una carrera de unicidad PostgreSQL en HTTP 409", () => {
    expect(route).toContain('error.code === "23505"');
    expect(route).toContain("SETTLEMENT_UNIQUENESS_CONFLICT");
    expect(route).toContain("{ status: 409 }");
  });
});
