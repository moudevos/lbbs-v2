import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  getCashMovementAvailableAmount,
  isApplicablePosWithdrawal,
} from "@/features/cash/cash-movement-applications";

const migration = readFileSync(resolve(process.cwd(), "src/sql/170_release_pre_treasury.sql"), "utf8");

describe("POS cash movement applications phase B1", () => {
  it("calculates available amount without persisting a balance", () => {
    expect(getCashMovementAvailableAmount(100, 0)).toBe(100);
    expect(getCashMovementAvailableAmount(100, 40)).toBe(60);
    expect(getCashMovementAvailableAmount(100, 170)).toBe(0);
  });

  it("only makes active cash withdrawals eligible", () => {
    expect(isApplicablePosWithdrawal({ movementType: "income", categoryCode: "cash_withdrawal", status: "active", amount: 100, appliedAmount: 0 })).toBe(false);
    expect(isApplicablePosWithdrawal({ movementType: "expense", categoryCode: "operational_expense", status: "active", amount: 100, appliedAmount: 0 })).toBe(false);
    expect(isApplicablePosWithdrawal({ movementType: "expense", categoryCode: "cash_withdrawal", status: "cancelled", amount: 100, appliedAmount: 0 })).toBe(false);
    expect(isApplicablePosWithdrawal({ movementType: "expense", categoryCode: "cash_withdrawal", status: "active", amount: 100, appliedAmount: 0 })).toBe(true);
  });

  it("locks and validates available money before creating the debt application", () => {
    expect(migration).toContain("where id = p_cash_movement_id\n  for update");
    expect(migration).toContain("from public.cash_movement_applications\n  where cash_movement_id = v_movement.id");
    expect(migration).toContain("if round(p_amount, 2) > v_available_amount");
  });

  it("creates the debt and its application in the same RPC without another cash movement", () => {
    const rpc = migration.slice(migration.indexOf("create_employee_debt_from_pos_cash"), migration.indexOf("-- The pre-existing disbursement RPC"));
    expect(rpc).toContain("public.create_employee_debt");
    expect(rpc).toContain("insert into public.cash_movement_applications");
    expect(rpc).not.toContain("insert into public.cash_movements");
  });

  it("keeps external cash and digital disbursements outside the POS-withdrawal RPC", () => {
    expect(migration).toContain("v_cash_context='external'");
    expect(migration).toContain("wallet_qr','bank_transfer");
  });

  it("blocks direct cancellation when an application exists", () => {
    expect(migration).toContain("exists (select 1 from public.cash_movement_applications where cash_movement_id = v_movement.id)");
    expect(migration).toContain("Este movimiento ya está vinculado a una operación y no puede anularse directamente.");
  });
});
