export type ProductBusinessLine = "barbershop_products" | "cafeteria_products" | "other";

export function commercialFamily(value: ProductBusinessLine | null | undefined) {
  return value === "barbershop_products" || value === "cafeteria_products" ? value : "";
}

export function categoriesForProductFamily<T extends { business_line?: ProductBusinessLine }>(
  categories: T[],
  family: "barbershop_products" | "cafeteria_products" | "",
) {
  return family ? categories.filter((category) => category.business_line === family) : categories;
}
