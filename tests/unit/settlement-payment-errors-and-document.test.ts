import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { normalizeDatabaseError } from "@/lib/errors/normalize-database-error";

const root = process.cwd();
const paymentCashGuardBlock = (sql: string) => sql.slice(
  sql.indexOf("-- BLOQUE: Settlement payment cash guard"),
  sql.indexOf("-- BLOQUE: Final UX and debt cash reconciliation"),
);

describe("settlement payment errors and document", () => {
  it("normalizes payment, POS, debt and status errors to functional codes", () => {
    expect(normalizeDatabaseError({ message: "La referencia es obligatoria para el método digital." }).code).toBe("SETTLEMENT_PAYMENT_REFERENCE_REQUIRED");
    expect(normalizeDatabaseError({ message: "No existe una sesión POS abierta para registrar la parte en efectivo." }).code).toBe("SETTLEMENT_POS_SESSION_REQUIRED");
    expect(normalizeDatabaseError({ message: "El efectivo disponible de la caja no cubre la parte en efectivo." }).code).toBe("SETTLEMENT_CASH_INSUFFICIENT");
    expect(normalizeDatabaseError({ message: "La deuda reservada ya no tiene saldo suficiente." }).code).toBe("SETTLEMENT_DEBT_BALANCE_CHANGED");
    expect(normalizeDatabaseError({ message: "La liquidación debe estar aprobada antes de pagar." }).code).toBe("SETTLEMENT_INVALID_STATUS");
  });

  it("keeps the cash comparison before the cash movement in v194", async () => {
    const sql = await readFile(path.join(root, "src/sql/170_release_pre_treasury.sql"), "utf8");
    const block = paymentCashGuardBlock(sql);
    expect(block).toContain("pay_employee_settlement_v194");
    expect(block).toContain("perform public.sync_pos_session_totals(v_session.id)");
    expect(block).toContain("select expected_cash_amount into v_available_cash");
    expect(block.indexOf("v_amount>coalesce(v_available_cash,0)")).toBeLessThan(block.indexOf("insert into public.cash_movements"));
  });

  it("requires payment references in the client and previews the actual PDF", async () => {
    const detail = await readFile(path.join(root, "src/features/settlements/SettlementDetailPageClient.tsx"), "utf8");
    expect(detail).toContain('method?.payment_kind === "wallet_qr"');
    expect(detail).toContain('kind === "bank_transfer"');
    expect(detail).toContain("Referencia * (obligatoria)");
    expect(detail).toContain("document?mode=inline");
    expect(detail).toContain("URL.createObjectURL");
  });

  it("queries active payment parts and supplies them to the PDF document", async () => {
    const [route, pdf, document] = await Promise.all([
      readFile(path.join(root, "src/app/api/admin/settlements/[settlementId]/document/route.ts"), "utf8"),
      readFile(path.join(root, "src/features/settlements/EmployeeSettlementPdf.tsx"), "utf8"),
      readFile(path.join(root, "src/features/settlements/EmployeeSettlementDocument.tsx"), "utf8"),
    ]);
    expect(route).toContain('.in("status", ["posted", "active"])');
    expect(route).toContain("payments: payments.data ?? []");
    expect(route).toContain('get("mode") === "inline" ? "inline" : "attachment"');
    expect(pdf).toContain("const activePayments = payments.filter");
    expect(document).toContain("const activePayments = payments.filter");
  });
});
