import { describe, expect, it } from "vitest";
import { resolveProductPrice } from "@/lib/pos/employee-pricing";

describe("employee buyer product pricing", () => {
  const base = { retailPrice: 5, visibilityScope: "both" as const };
  it("uses retail for a normal customer", () => expect(resolveProductPrice({ ...base, employeePrice: 3.5, isEmployeeBuyer: false })).toMatchObject({ effectivePrice: 5, priceSource: "retail" }));
  it("uses employee price independently of payment", () => expect(resolveProductPrice({ ...base, employeePrice: 3.5, isEmployeeBuyer: true })).toMatchObject({ effectivePrice: 3.5, priceSource: "employee" }));
  it("falls back to retail when a commercial employee override is absent", () => expect(resolveProductPrice({ ...base, employeePrice: null, isEmployeeBuyer: true })).toMatchObject({ effectivePrice: 5, priceSource: "retail_fallback" }));
  it("falls back to retail for an internal-only product when no special employee price exists", () =>
    expect(resolveProductPrice({ retailPrice: 5, employeePrice: null, isEmployeeBuyer: true, visibilityScope: "internal" })).toMatchObject({
      effectivePrice: 5,
      priceSource: "retail_fallback",
      employeePriceActive: false,
    }));
  it("uses the special employee price for an internal-only product when configured", () =>
    expect(resolveProductPrice({ retailPrice: 5, employeePrice: 3.5, isEmployeeBuyer: true, visibilityScope: "internal" })).toMatchObject({
      effectivePrice: 3.5,
      priceSource: "internal",
      employeePriceActive: true,
    }));
});
