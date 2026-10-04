import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("acceptance hotfix 184", () => {
  it("uses signed postings for P&L and preserves reversals as negative facts", async () => {
    const sql = await readFile(
      path.resolve(root, "src/sql/170_release_pre_treasury.sql"),
      "utf8",
    );

    expect(sql).toContain("from public.vw_financial_postings_signed posting");
    expect(sql).toContain("coalesce(-sum(posting.profit_signed_amount)");
    expect(sql).toContain("posting.affects_profit");
  });

  it("rejects duplicated debt disbursement methods before creating a debt", async () => {
    const sql = await readFile(
      path.resolve(root, "src/sql/170_release_pre_treasury.sql"),
      "utf8",
    );
    const guardIndex = sql.indexOf("No se puede repetir el mismo método de desembolso.");
    const debtInsertIndex = sql.lastIndexOf("v_debt := public.create_employee_debt");

    expect(guardIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(debtInsertIndex);
  });

  it("keeps manual debt types explicit while retaining operational supply support", async () => {
    const sql = await readFile(
      path.resolve(root, "src/sql/170_release_pre_treasury.sql"),
      "utf8",
    );

    expect(sql).toContain("'penalty', 'administrative_charge', 'other'");
    expect(sql).toContain("'loan', 'advance', 'supply', 'internal_credit'");
  });
});
