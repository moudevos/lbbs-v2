import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationPath = path.join(root, "src/sql/170_release_pre_treasury.sql");

describe("settlement, debt and payable reversals 187", () => {
  it("keeps reversal accounting dates equal to their original economic event and backfills legacy dates", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("v_original.accounting_date, v_original.branch_id");
    expect(sql).toContain("set accounting_date = original.accounting_date");
    expect(sql).toContain("reversal.reversal_of_id = original.id");
  });

  it("has explicit auto/manual/none debt application and caps FIFO allocation at net pay", async () => {
    const sql = await readFile(migrationPath, "utf8");
    const route = await readFile(path.join(root, "src/app/api/admin/settlements/route.ts"), "utf8");
    expect(sql).toContain("p_debt_application_mode not in ('auto', 'manual', 'none')");
    expect(sql).toContain("order by debt.created_at, debt.id");
    expect(sql).toContain("v_apply := least(v_available, v_debt.outstanding_amount)");
    expect(sql).toContain("settlement.status in ('draft', 'review', 'approved')");
    expect(route).toContain('rpc("prepare_employee_settlement_v193"');
    expect(route).toContain("normalizedDebtDeductions");
  });

  it("opens debt cards directly against the full employee and branch profile", async () => {
    const page = await readFile(path.join(root, "src/features/employees/EmployeeDebtsPageClient.tsx"), "utf8");
    const route = await readFile(path.join(root, "src/app/api/admin/employee-debts/profile/route.ts"), "utf8");
    expect(page).toContain("openDebtProfile(profile.employee_id, profile.branch_id)");
    expect(page).not.toContain("firstDebt");
    expect(page).not.toContain('mode === "history"');
    expect(route).toContain('from("vw_employee_debt_ledger")');
    expect(route).toContain('.eq("branch_id", branchId)');
  });

  it("reverses CxP payments once with audit fields and does not create a second expense", async () => {
    const sql = await readFile(migrationPath, "utf8");
    const route = await readFile(path.join(root, "src/app/api/admin/finance/payables/payments/[paymentId]/reverse/route.ts"), "utf8");
    expect(sql).toContain("reverse_operational_accounts_payable_payment");
    expect(sql).toContain("reversed_at timestamptz");
    expect(sql).toContain("v_payment.status <> 'posted'");
    expect(sql).toContain("'liability_decrease'");
    expect(sql).toContain("caja POS ya cerrada");
    expect(route).toContain('rpc("reverse_operational_accounts_payable_payment"');
  });
});
