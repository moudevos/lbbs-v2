import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const saleReferencesBlock = (sql: string) => sql.slice(
  sql.indexOf("-- BLOQUE: Settlement sale references"),
  sql.indexOf("-- BLOQUE: POS employee buyer pricing"),
);

describe("192 settlement sale reference and debt display contract", () => {
  const migration = read("src/sql/170_release_pre_treasury.sql");

  it("creates product snapshots with the canonical VTA reference and real bonus", () => {
    const block = saleReferencesBlock(migration);
    expect(block).toContain("snapshot_employee_settlement_product_lines_v183");
    expect(block).toContain("concat('VTA-', upper(left(sale.id::text, 8)))");
    expect(block).not.toContain("sale.sale_number");
    expect(block).toContain("bonus.total_bonus_amount");
    expect(block).toContain("vw_employee_settlement_consumed_sources");
  });

  it("snapshots a product-attribution fixture and the selected debt source prospectively", () => {
    const block = saleReferencesBlock(migration);
    expect(block).toContain("employee_settlement_product_lines");
    expect(block).toContain("attribution.sale_item_id");
    expect(block).toContain("debt_sale_reference_snapshot");
    expect(block).toContain("debt_first_item_description_snapshot");
    expect(block).toContain("employee_settlement_deductions");
  });

  it("uses the movement ledger as the only visible debt-history source", () => {
    const profileRoute = read("src/app/api/admin/employee-debts/profile/route.ts");
    const block = saleReferencesBlock(migration);
    expect(block).toContain("from public.employee_debt_movements movement");
    expect(block).not.toContain("union all");
    expect(profileRoute).toContain("vw_employee_debt_source_detail");
    expect(profileRoute).toContain("Venta ${source.sale_reference}");
  });

  it("enriches v188 debt availability without reimplementing reservations", () => {
    const optionsRoute = read("src/app/api/admin/employee-debts/settlement-options/route.ts");
    expect(optionsRoute).toContain("get_employee_settlement_debt_options_v188");
    expect(optionsRoute).toContain("vw_employee_debt_source_detail");
    expect(optionsRoute).toContain("sourceByDebt");
  });

  it("keeps debt descriptions readable in selection and document detail", () => {
    const selection = read("src/features/settlements/SettlementDebtSelection.tsx");
    const document = read("src/features/settlements/settlement-document-summary.ts");
    expect(selection).toContain("Consumo POS");
    expect(selection).toContain("items más");
    expect(selection).not.toContain("truncate");
    expect(document).toContain("administrative_charge");
    expect(document).toContain("debt_first_item_description_snapshot");
  });

  it("does not report paid settlements as active", () => {
    const settlementsRoute = read("src/app/api/admin/settlements/route.ts");
    expect(settlementsRoute).toContain('["draft", "review", "approved"].includes(item.status)');
  });
});
