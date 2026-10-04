import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getDebtOriginSnapshot,
  getLoanInterestSnapshot,
} from "@/features/employees/loan-interest";

const loanInterestBlock = (sql: string) => sql.slice(
  sql.indexOf("-- BLOQUE: Loan Interest Snapshot B1.1"),
);

describe("snapshot de interés para préstamos de empleados", () => {
  it("calcula una sola vez capital, interés y deuda total", () => {
    expect(getLoanInterestSnapshot("loan", 100, 10)).toEqual({
      principalAmount: 100,
      interestRatePercent: 10,
      interestAmount: 10,
      totalDebt: 110,
    });
    expect(getLoanInterestSnapshot("loan", 99.99, 7.5)).toEqual({
      principalAmount: 99.99,
      interestRatePercent: 7.5,
      interestAmount: 7.5,
      totalDebt: 107.49,
    });
  });

  it("mantiene adelantos sin interés y representa históricos sin inventarlo", () => {
    expect(getLoanInterestSnapshot("advance", 100, 10)).toEqual({
      principalAmount: 100,
      interestRatePercent: 0,
      interestAmount: 0,
      totalDebt: 100,
    });
    expect(getDebtOriginSnapshot({
      debtType: "loan",
      originalAmount: 110,
      principalAmount: null,
    })).toEqual({
      hasSnapshot: false,
      principalAmount: 110,
      interestRatePercent: 0,
      interestAmount: 0,
    });
  });

  it("mantiene el snapshot nuevo para el desglose de lectura", () => {
    expect(getDebtOriginSnapshot({
      debtType: "loan",
      originalAmount: 110,
      principalAmount: 100,
      interestRatePercent: 10,
      interestAmount: 10,
    })).toEqual({
      hasSnapshot: true,
      principalAmount: 100,
      interestRatePercent: 10,
      interestAmount: 10,
    });
  });

  it("mantiene capital como única aplicación POS y registra la deuda total", async () => {
    const migration = await readFile(
      path.resolve(process.cwd(), "src/sql/170_release_pre_treasury.sql"),
      "utf8",
    );
    const block = loanInterestBlock(migration);
    expect(block).toContain("if v_principal > v_available_amount then");
    expect(block).toContain("v_total := round(v_principal + v_interest, 2)");
    expect(block).toContain("v_debt.id, v_principal, v_actor");
    expect(block).toContain("original_amount, outstanding_amount");
    expect(block).toContain("v_total, v_total");
    expect(block).toContain("if v_rate = 'NaN'::numeric or v_rate < 0");
    expect(migration).toContain("Los adelantos no admiten interés.");
  });

  it("mantiene efectivo externo y digital fuera de aplicaciones POS", async () => {
    const migration = await readFile(
      path.resolve(process.cwd(), "src/sql/170_release_pre_treasury.sql"),
      "utf8",
    );
    const externalRpc = loanInterestBlock(migration).slice(
      loanInterestBlock(migration).indexOf("create_employee_debt_with_disbursements_v2"),
    );
    expect(externalRpc).toContain("v_total_disbursed, 2) <> v_principal");
    expect(externalRpc).not.toContain("cash_movement_applications");
    expect(externalRpc).not.toContain("insert into public.cash_movements");
    expect(externalRpc).toContain("wallet_qr");
    expect(externalRpc).toContain("bank_transfer");
  });

  it("es aditiva y no altera ni elimina hechos históricos", async () => {
    const migration = await readFile(
      path.resolve(process.cwd(), "src/sql/170_release_pre_treasury.sql"),
      "utf8",
    );
    const block = loanInterestBlock(migration);
    expect(block).toContain("add column if not exists principal_amount numeric(12,2)");
    expect(block).toContain("add column if not exists interest_rate_percent numeric(9,4)");
    expect(block).toContain("add column if not exists interest_amount numeric(12,2)");
    expect(block).not.toMatch(/\bupdate\s+public\.(employee_debts|employee_debt_movements|cash_movements|cash_movement_applications)\b/i);
    expect(block).not.toMatch(/\bdelete\s+(from\s+)?public\./i);
    expect(block).not.toMatch(/\btruncate\b/i);
  });
});
