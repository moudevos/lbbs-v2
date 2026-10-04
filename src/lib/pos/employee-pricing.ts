export type ProductPriceSource = "retail" | "employee" | "retail_fallback" | "internal";

/** Canonical application read-model rule. The checkout RPC enforces the same
 * rule transactionally, so a displayed amount is never authoritative. */
export function resolveProductPrice(input: {
  retailPrice: number;
  employeePrice: number | null | undefined;
  isEmployeeBuyer: boolean;
  visibilityScope: "pos" | "internal" | "both";
}) {
  const hasEmployeePrice = input.employeePrice !== null && input.employeePrice !== undefined;
  if (input.isEmployeeBuyer && hasEmployeePrice) {
    return { effectivePrice: input.employeePrice, priceSource: input.visibilityScope === "internal" ? "internal" : "employee" as ProductPriceSource, employeePriceActive: true };
  }
  return { effectivePrice: input.retailPrice, priceSource: input.isEmployeeBuyer ? "retail_fallback" : "retail" as ProductPriceSource, employeePriceActive: false };
}
