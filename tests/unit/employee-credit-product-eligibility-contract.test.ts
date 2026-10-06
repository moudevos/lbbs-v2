import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = readFileSync(
  resolve(root, "supabase/migrations/20261006223000_employee_credit_product_eligibility.sql"),
  "utf8",
);
const checkoutRoute = readFileSync(
  resolve(root, "src/app/api/admin/pos/checkout/route.ts"),
  "utf8",
);
const productsRoute = readFileSync(
  resolve(root, "src/app/api/admin/products/route.ts"),
  "utf8",
);
const productUpdateRoute = readFileSync(
  resolve(root, "src/app/api/admin/products/[id]/route.ts"),
  "utf8",
);
const internalCore = readFileSync(
  resolve(root, "src/sql/128_internal_pos_benefits_and_accounts.sql"),
  "utf8",
);

describe("employee credit product eligibility", () => {
  it("keeps employee credit eligibility on the employee link, not the product", () => {
    expect(internalCore).toContain("v_link.can_use_internal_credit");
    expect(internalCore).toContain("El credito interno solo esta disponible para productos.");
    expect(migration).not.toContain("El crédito de empleado solo permite productos habilitados para empleados.");
    expect(migration).not.toContain("El producto interno no tiene una configuración de precio para empleados.");
  });

  it("uses employee price when present and retail fallback when absent", () => {
    expect(migration).toContain("v_employee_price is not null");
    expect(migration).toContain("else v_retail_price");
    expect(migration).toContain("checkout_pos_sale_phase0_core");
    expect(checkoutRoute).not.toContain("El producto interno no tiene una configuración de precio para empleados.");
  });

  it("keeps internal-only products restricted to linked employees", () => {
    expect(migration).toContain("v_product.visibility_scope = 'internal' and v_buyer_employee_id is null");
    expect(migration).toContain("Este producto está disponible únicamente para empleados.");
  });

  it("does not make special employee pricing mandatory just because visibility is internal", () => {
    expect(productsRoute).toContain('const enabled = supportsEmployeePricing && payload?.employee_price_enabled === true;');
    expect(productUpdateRoute).toContain('const enabled = supportsEmployeePricing && payload?.employee_price_enabled === true;');
    expect(productsRoute).not.toContain('visibilityScope === "internal" || (visibilityScope === "both"');
  });
});
