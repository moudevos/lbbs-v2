import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const route = readFileSync(
  resolve(process.cwd(), "src/app/api/admin/payment-simulations/route.ts"),
  "utf8",
);
const ui = readFileSync(
  resolve(
    process.cwd(),
    "src/features/payment-simulations/PaymentSimulationsPageClient.tsx",
  ),
  "utf8",
);

describe("simulaciones de liquidación sin persistencia", () => {
  it("carga referencia del sistema y producción en vivo sin crear liquidaciones", () => {
    expect(route).toContain('supabase.rpc("get_live_production_preview"');
    expect(route).toContain('.from("employee_service_production")');
    expect(route).toContain('.from("employee_debts")');
    expect(route).toContain('.from("sale_items")');
    expect(route).not.toContain("export async function POST");
    expect(route).not.toContain('.insert(');
    expect(route).not.toContain('.update(');
    expect(route).not.toContain("prepare_employee_settlement");
  });

  it("permite modo completamente manual al no seleccionar personal", () => {
    expect(ui).toContain("Sin personal · ingreso 100 % manual");
    expect(ui).toContain("Total de deudas a descontar");
    expect(ui).toContain("Ingreso manual");
  });

  it("permite seleccionar deudas reales y editar montos parciales", () => {
    expect(ui).toContain("Monto a descontar");
    expect(ui).toContain("setDebtSelected");
    expect(ui).toContain("updateDebtAmount");
    expect(ui).toContain("Deuda seleccionada");
  });

  it("muestra los seis conceptos principales de una liquidación simulada", () => {
    for (const label of [
      "Total producido",
      "Base comisionable",
      "Bruto a cobrar",
      "Descuento obligatorio",
      "Deudas aplicadas",
      "Neto estimado",
    ]) {
      expect(ui).toContain(label);
    }
  });

  it("deja claro que no altera liquidaciones, caja, deudas ni P&L", () => {
    expect(ui).toContain(
      "Nada de esta pantalla crea liquidaciones, consume deudas ni afecta caja o P&L.",
    );
    expect(ui).toContain("Solo simulación");
  });
});
