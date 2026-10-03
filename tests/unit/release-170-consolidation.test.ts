import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const releaseSql = path.join(root, "src/sql/170_release_pre_treasury.sql");
const migrationsDir = path.join(root, "supabase/migrations");

describe("release 170 consolidado", () => {
  it("mantiene un único SQL productivo y una migration espejo idéntica", async () => {
    const migrationNames = (await readdir(migrationsDir)).filter((name) =>
      /^\d+_release_170_pre_treasury\.sql$/.test(name),
    );
    expect(migrationNames).toHaveLength(1);

    const [sql, migration] = await Promise.all([
      readFile(releaseSql),
      readFile(path.join(migrationsDir, migrationNames[0])),
    ]);
    const hash = (value: Buffer) => createHash("sha256").update(value).digest("hex");
    expect(hash(sql)).toBe(hash(migration));
  });

  it("contiene los contratos finales y excluye SQL de recuperación QA", async () => {
    const [sql, posCashFlow] = await Promise.all([
      readFile(releaseSql, "utf8"),
      readFile(path.join(root, "src/features/pos/pos-cash-flow.ts"), "utf8"),
    ]);
    expect(sql).toContain("LBBS RELEASE 170");
    expect(sql).toContain("pay_employee_settlement_v194");
    expect(sql).toContain("get_financial_analysis_v2");
    expect(posCashFlow).toContain('"operational_income" : "cash_withdrawal"');
    expect(sql).toContain("cash_movement_applications");
    expect(sql).toContain("create_employee_debt_from_pos_cash_v2");
    expect(sql).toContain("principal_amount numeric(12,2)");
    expect(sql).toContain("interest_rate_percent numeric(9,4)");
    expect(sql).toContain("product_category_id");
    expect(sql).not.toContain("RESET_PAYMENT_ONLY");
    expect(sql).not.toContain("src/sql/dev/");
    expect(sql).not.toContain("src/sql/qa/");
    expect(sql).not.toMatch(/^\s*truncate\b/im);
  });
});
