import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261023015534_pos_employee_credit_commercial_courtesy_and_link_scope.sql"),
  "utf8",
);

describe("POS: employee credit + benefit + commercial courtesy", () => {
  it("allows a courtesy with an employee benefit even if the balance is sent to credit", () => {
    expect(migration).toContain("v_operation_kind = ''employee_credit'' and v_rule_id is not null");
    expect(migration).toContain("if v_operation_kind in (''employee_benefit'', ''employee_credit'')");
  });

  it("requires a paid service and preserves the ban on unqualified credit and internal gifts", () => {
    expect(migration).toContain("v_rule_id is not null");
    expect(migration).toContain("round(coalesce(item.total, 0), 2) > 0");
    expect(migration).toContain("v_operation_kind not in (''customer'', ''employee_benefit'')");
  });

  it("uses the scoped existing internal-options lookup instead of weakening reception RLS", () => {
    expect(migration).toContain("get_pos_internal_options(v_customer_id, v_branch_id)");
    expect(migration).toContain("LBBS_POS_LINK_VISIBILITY_V2");
    expect(migration).not.toContain("CREATE POLICY");
    expect(migration).not.toContain("GRANT SELECT");
  });

  it("checks function contracts and can safely be reapplied", () => {
    expect(migration).toContain("Parche parcial detectado");
    expect(migration).toContain("LBBS_POS_CREDIT_COURTESY_V2");
    expect(migration).toContain("v_marker IN v_core");
  });

  it("does not rewrite historical sales or change stock, commission and payment code", () => {
    expect(migration).not.toMatch(/\bUPDATE\s+public\.sales\b/i);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(migration).not.toMatch(/\bDROP\s+(TABLE|FUNCTION|TRIGGER)\b/i);
  });
});
