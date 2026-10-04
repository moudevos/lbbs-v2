import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(resolve(process.cwd(), "src/sql/170_release_pre_treasury.sql"), "utf8");

describe("sales canonical read model", () => {
  it("uses explicit line responsibility with documented historical fallbacks", () => {
    expect(migration).toContain("vw_sale_employee_attributions");
    expect(migration).toContain("item.attributed_employee_id");
    expect(migration).toContain("item.barber_id");
    expect(migration).toContain("case when item.item_type = 'service' then sale.barber_id end");
  });
  it("filters before pagination and exposes reconciliation", () => {
    expect(migration).toContain("get_sales_canonical_page");
    expect(migration).toContain("offset (v_page - 1) * v_page_size");
    expect(migration).toContain("get_sales_reconciliation");
  });
  it("keeps reward courtesy eligibility tied to commercial service value", () => {
    expect(migration).toContain("coalesce(si.original_total, si.quantity * si.unit_price)");
  });
});
