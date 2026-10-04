import { describe, expect, it } from "vitest";
import { calculateExpectedCash } from "@/features/cash/cash-math";

describe("cash operational flow", () => {
  it("subtracts a decrease adjustment rather than adding it", () => {
    expect(calculateExpectedCash({ opening: 100, adjustmentDecrease: 20 })).toBe(80);
  });
  it("uses the audited effective opening in the closing formula", () => {
    expect(calculateExpectedCash({ opening: 1000, openingDecrease: 900, cashSales: 300, expense: 20 })).toBe(380);
  });
});
