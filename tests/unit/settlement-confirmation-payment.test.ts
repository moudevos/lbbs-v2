import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("final settlement flow", () => {
  it("uses one atomic confirmation before payment", async () => {
    const [migration, detail] = await Promise.all([
      readFile(path.resolve(root, "src/sql/170_release_pre_treasury.sql"), "utf8"),
      readFile(path.resolve(root, "src/features/settlements/SettlementDetailPageClient.tsx"), "utf8"),
    ]);
    expect(migration).toContain("confirm_employee_settlement_v193");
    expect(migration).toContain("review_employee_settlement");
    expect(migration).toContain("transition_employee_settlement(p_settlement_id, 'approve', null)");
    expect(detail).toContain("Confirmar liquidación");
    expect(detail).not.toContain(">Aprobar liquidación<");
  });

  it("keeps the canonical multipart payment and cash guard", async () => {
    const [migration, detail] = await Promise.all([
      readFile(path.resolve(root, "src/sql/170_release_pre_treasury.sql"), "utf8"),
      readFile(path.resolve(root, "src/features/settlements/SettlementDetailPageClient.tsx"), "utf8"),
    ]);
    expect(migration).toContain("pay_employee_settlement_v189");
    expect(migration).toContain("La suma de las partes debe coincidir exactamente con el neto de la liquidación.");
    expect(migration).toContain("v_method.payment_kind = 'cash'");
    expect(detail).toContain("paymentParts");
    expect(detail).toContain("Saldo pendiente");
  });

  it("keeps cancellation reason codes and paid immutability in the canonical transition", async () => {
    const [migration, transition] = await Promise.all([
      readFile(path.resolve(root, "src/sql/170_release_pre_treasury.sql"), "utf8"),
      readFile(path.resolve(root, "src/sql/143_settlement_confirmation_payment_documents.sql"), "utf8"),
    ]);
    expect(migration).toContain("CALCULATION_ERROR");
    expect(migration).toContain("WRONG_PRODUCTION");
    expect(transition).toContain("v_row.status = 'paid'");
  });

  it("continues to recalculate closed production before preparing a draft", async () => {
    const route = await readFile(path.resolve(root, "src/app/api/admin/settlements/route.ts"), "utf8");
    expect(route).toContain('supabase.rpc("generate_production_for_period"');
    expect(route).toContain("prepare_employee_settlement_v193");
  });
});
