import { describe, expect, it } from "vitest";

import { categoriesForProductFamily, commercialFamily } from "@/features/products/product-family";

describe("familia comercial de producto", () => {
  const categories = [
    { id: "barber", business_line: "barbershop_products" as const },
    { id: "cafe", business_line: "cafeteria_products" as const },
    { id: "old", business_line: "other" as const },
  ];

  it("mantiene la familia elegida aunque aún no exista categoría", () => {
    expect(commercialFamily("barbershop_products")).toBe("barbershop_products");
  });

  it("filtra categorías según familia y permite que un histórico other se reclasifique", () => {
    expect(categoriesForProductFamily(categories, "cafeteria_products").map((item) => item.id)).toEqual(["cafe"]);
    expect(commercialFamily("other")).toBe("");
  });
});
