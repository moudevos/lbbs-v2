import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261013001908_redesign_retroactive_sunday_operations.sql"),
  "utf8",
);
const mirror = readFileSync(
  resolve(process.cwd(), "src/sql/20261013001908_redesign_retroactive_sunday_operations.sql"),
  "utf8",
);

describe("operación dominical retroactiva", () => {
  it("mantiene la migración y el mirror idénticos", () => {
    expect(mirror).toBe(migration);
  });

  it("usa precios efectivos, idempotencia y stock canónico", () => {
    expect(migration).toContain("vw_services_effective_prices");
    expect(migration).toContain("vw_product_stock");
    expect(migration).toContain("entry_idempotency_key");
    expect(migration).toContain("case when is_courtesy then 'courtesy' else 'sale' end");
    expect(migration).not.toContain("quantity*-1");
  });

  it("mantiene cortesías por categoría/fallback y nunca permite canje", () => {
    expect(migration).toContain("benefit.product_category_id = v_product_item.category_id");
    expect(migration).toContain("p.is_courtesy_allowed");
    expect(migration).not.toContain("reward_entitlement_id");
  });

  it("aísla la venta dominical de POS, producción y quincenas", () => {
    expect(migration).not.toContain("checkout_pos_sale");
    expect(migration).not.toContain("employee_service_production");
    expect(migration).not.toContain("employee_settlements");
    expect(migration).toContain("cancel_sunday_sale");
    expect(migration).toContain("reverse_rewards_for_cancelled_sunday_sale");
  });
});
