import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationPath = path.join(
  root,
  "src/sql/170_release_pre_treasury.sql",
);
const runtimeBlock = (sql: string) => sql.slice(
  sql.indexOf("-- BLOQUE: Final Phase 1A/1B runtime fixes"),
  sql.indexOf("-- BLOQUE: Settlement debt and payable reversal"),
);

describe("runtime acceptance 186", () => {
  it("snapshots the real sale-item description and active product bonus", async () => {
    const sql = await readFile(migrationPath, "utf8");
    const block = runtimeBlock(sql);
    expect(block).toContain("item.description_snapshot");
    expect(block).not.toContain("item.item_name_snapshot");
    expect(block).toContain("bonus.total_bonus_amount");
    expect(block).toContain("bonus.payroll_period_id = new.payroll_period_id");
  });

  it("normalizes the checkout responsible key and supports only one service executor", async () => {
    const sql = await readFile(migrationPath, "utf8");
    const route = await readFile(path.join(root, "src/app/api/admin/pos/checkout/route.ts"), "utf8");
    const block = runtimeBlock(sql);
    expect(block).toContain("nullif(v_item->>'responsible_employee_id', '')::uuid");
    expect(block).toContain("v_inherited_service_executor");
    expect(route).toContain("responsible_employee_id: item.itemType === \"product\"");
    expect(route).toContain("serviceExecutors.size === 1");
  });

  it("uses coded finance cancellation with an audit note", async () => {
    const sql = await readFile(migrationPath, "utf8");
    const route = await readFile(path.join(root, "src/app/api/admin/finance/[entryId]/route.ts"), "utf8");
    const block = runtimeBlock(sql);
    expect(block).toContain("cancellation_reason_code text");
    expect(block).toContain("cancel_operational_finance_entry_v186");
    expect(route).toContain('rpc("cancel_operational_finance_entry_v186"');
    expect(route).toContain("details: error.details");
  });

  it("loads a debt profile independently from the list status filter", async () => {
    const profileRoute = await readFile(
      path.join(root, "src/app/api/admin/employee-debts/profile/route.ts"),
      "utf8",
    );
    const page = await readFile(
      path.join(root, "src/features/employees/EmployeeDebtsPageClient.tsx"),
      "utf8",
    );
    expect(profileRoute).toContain('from("vw_employee_debt_ledger")');
    expect(profileRoute).toContain('.eq("employee_id", employeeId)');
    expect(page).not.toContain("Mapa de deudas");
    expect(page).toContain("openDebtProfile");
  });
});
