import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = readFileSync(resolve(root, "supabase/migrations/20261013204446_historical_sale_reversal_and_debt_writeoff.sql"), "utf8");
const mirror = readFileSync(resolve(root, "src/sql/20261013204446_historical_sale_reversal_and_debt_writeoff.sql"), "utf8");
const debtsUi = readFileSync(resolve(root, "src/features/employees/EmployeeDebtsPageClient.tsx"), "utf8");
const salesUi = readFileSync(resolve(root, "src/features/sales/sales-panel.tsx"), "utf8");

describe("historical sale reversals and employee debt write-off", () => {
  it("keeps the tracked SQL mirror byte-identical", () => {
    expect(mirror).toBe(migration);
  });

  it("makes historical reversal owner/admin-only, closed-session-only and accounting-date bounded", () => {
    expect(migration).toContain("if not public.is_admin()");
    expect(migration).toContain("v_today - v_sale.accounting_date");
    expect(migration).toContain("v_age < 0 or v_age > 15");
    expect(migration).toContain("USE_POS_CANCELLATION");
    expect(migration).toContain("POS_SESSION_NOT_CLOSED");
  });

  it("records immutable audit facts and preserves the original operational records", () => {
    expect(migration).toContain("create table public.sale_reversals");
    expect(migration).toContain("sale_id uuid not null unique");
    expect(migration).toContain("create table public.sale_reversal_payments");
    expect(migration).toContain("payment_kind<>'internal_credit'");
    expect(migration).toContain("document_type in ('internal_ticket','internal_credit_note')");
    expect(migration).not.toContain("delete from public.sale_payments");
    expect(migration).not.toContain("update public.pos_sessions");
  });

  it("uses correct settlement/internal-credit links and current financial date for historical reversal", () => {
    expect(migration).toContain("l.production_entry_id");
    expect(migration).toContain("op.debt_id");
    expect(migration).not.toContain("l.production_id");
    expect(migration).not.toContain("op.employee_debt_id");
    expect(migration).toContain("v_reversal.reversal_accounting_date");
    expect(migration).toContain("financial_posting_reversal");
  });

  it("exposes the historical flow in sales and the generic write-off action for every debt type", () => {
    expect(salesUi).toContain("HistoricalSaleReversalModal");
    expect(salesUi).toContain("/reversal-preview");
    expect(salesUi).toContain("/reverse");
    expect(debtsUi).toContain("action: \"waive\"");
    expect(debtsUi).toContain("canWaiveDebts ? (");
    expect(debtsUi).toContain("onClick={() => waive(item)}");
    expect(debtsUi).not.toContain('canWaiveDebts && item.debt_type === "penalty"');
  });
});
