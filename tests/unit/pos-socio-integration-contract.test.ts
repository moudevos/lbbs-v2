import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const cart = readFileSync(resolve(process.cwd(), "src/features/pos/PosCart.tsx"), "utf8");
const endpoint = readFileSync(resolve(process.cwd(), "src/app/api/admin/pos/internal-options/route.ts"), "utf8");
const guard = readFileSync(resolve(process.cwd(), "src/sql/156_socio_rules_exclusive_pos_guard.sql"), "utf8");

describe("integración POS de Socios", () => {
  it("muestra la operación interna tanto para empleado como para socio", () => {
    expect(cart).toContain("hasInternalBeneficiary");
    expect(cart).toContain("isSocio ? \"Socio LBBS · beneficios exclusivos\"");
  });

  it("no muestra Rewards cuando el cliente es socio", () => {
    expect(cart).toContain("!hasInternalBeneficiary");
  });

  it("expone y acepta solo reglas exclusivas de socio", () => {
    expect(endpoint).toContain('rule.beneficiary_scope === "socio"');
    expect(guard).toContain("rule.beneficiary_scope = 'socio'");
  });
});
