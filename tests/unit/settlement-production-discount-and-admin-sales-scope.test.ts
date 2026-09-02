import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("descuento obligatorio y alcance de ventas por sede", () => {
  it("calcula el descuento obligatorio desde la producción bruta, no después de deudas", async () => {
    const sql = await readFile(
      path.resolve(root, "supabase/migrations/20260902051446_employee_debt_waivers_and_control_reconciliation.sql"),
      "utf8",
    );

    expect(sql).toContain("sum(production.collected_amount)");
    expect(sql).toContain("session.status = 'closed'");
    expect(sql).toContain("mandatory_discount_base_amount * new.mandatory_discount_rate / 100");
    expect(sql).toContain("v_mandatory_base * coalesce(v_settlement.mandatory_discount_rate, 1) / 100");
  });

  it("limita a su sede a un admin asignado y conserva el alcance global del owner", async () => {
    const sql = await readFile(
      path.resolve(root, "supabase/migrations/20260902044659_settlement_mandatory_discount_gross_production.sql"),
      "utf8",
    );
    const salesRoute = await readFile(
      path.resolve(root, "src/app/api/admin/sales/route.ts"),
      "utf8",
    );

    expect(sql).toContain("public.is_owner()");
    expect(sql).toContain("public.current_user_role() = 'admin'");
    expect(sql).toContain("public.current_branch_id() = target_branch_id");
    expect(sql).toContain("public.current_branch_id() is null");
    expect(salesRoute).toContain("assignedAdminBranchId ?? branchId");
    expect(salesRoute).toContain('salesQuery = salesQuery.eq("branch_id", effectiveBranchId)');
  });
});
