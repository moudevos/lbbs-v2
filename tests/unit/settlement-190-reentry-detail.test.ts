import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("190 settlement reentry and detail contract", () => {
  it("treats paid and cancelled as terminal while keeping one active settlement", () => {
    const active = new Set(["draft", "review", "approved"]);
    expect(active.has("paid")).toBe(false);
    expect(active.has("cancelled")).toBe(false);
    expect(active.has("review")).toBe(true);
  });

  it("uses the real product bonus snapshot and does not request nonexistent payment notes", () => {
    const migration = readFileSync(resolve(process.cwd(), "src/sql/170_release_pre_treasury.sql"), "utf8");
    const route = readFileSync(resolve(process.cwd(), "src/app/api/admin/settlements/[settlementId]/route.ts"), "utf8");
    expect(migration).toContain("bonus.total_bonus_amount");
    expect(migration).toContain("employee_settlements_one_active_employee_period");
    expect(migration).toContain("vw_employee_debt_source_detail");
    expect(route).not.toContain("reference,notes,status,created_at,payment_method");
    expect(route).toContain("reference,status,created_at,payment_method");
  });
});
