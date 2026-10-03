import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const finalAcceptanceBlock = (sql: string) => sql.slice(
  sql.indexOf("-- BLOQUE: Final financial acceptance fixes"),
  sql.indexOf("-- BLOQUE: Final Phase 1A/1B runtime fixes"),
);

describe("final acceptance 185", () => {
  it("uses the canonical VTA reference rather than a non-existent sale_number", async () => {
    const sql = await readFile(path.join(root, "src/sql/170_release_pre_treasury.sql"), "utf8");
    const block = finalAcceptanceBlock(sql);
    expect(block).toContain("concat('VTA-', upper(left(sale.id::text, 8)))");
    expect(block).not.toContain("attribution.sale_id, sale.sale_number");
  });

  it("resolves only an unambiguous barbería product executor on the server", async () => {
    const route = await readFile(path.join(root, "src/app/api/admin/pos/checkout/route.ts"), "utf8");
    expect(route).toContain("serviceExecutors.size === 1");
    expect(route).toContain("item.responsibleEmployeeId ?? barberId");
    expect(route).toContain("category?.business_line === \"barbershop_products\"");
  });

  it("keeps P&L costs as signed-view economic magnitudes", async () => {
    const sql = await readFile(path.join(root, "src/sql/170_release_pre_treasury.sql"), "utf8");
    const block = finalAcceptanceBlock(sql);
    expect(block).toContain("-sum(profit_signed_amount) filter(where financial_group='personnel_cost')");
    expect(block).toContain("vw_financial_postings_signed");
  });
});
