import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const detail = readFileSync(resolve(process.cwd(), "src/features/settlements/SettlementDetailPageClient.tsx"), "utf8");

describe("settlement payment confirmation", () => {
  it("opens the irreversible confirmation before invoking the pay action", () => {
    const confirmation = detail.indexOf('title: "¿Registrar el pago de la liquidación?"');
    const pay = detail.indexOf('await settlementAction("pay")');
    expect(confirmation).toBeGreaterThan(-1);
    expect(pay).toBeGreaterThan(confirmation);
    expect(detail).toContain('confirmButtonText: "Sí, registrar pago"');
    expect(detail).toContain('cancelButtonText: "Cancelar"');
    expect(detail).toContain("focusCancel: true");
    expect(detail).toContain("reverseButtons: true");
  });

  it("stops on cancellation without changing the modal or payment parts", () => {
    const cancelled = detail.indexOf("if (confirmation.isConfirmed !== true) return;");
    const pay = detail.indexOf('await settlementAction("pay")');
    expect(cancelled).toBeGreaterThan(-1);
    expect(cancelled).toBeLessThan(pay);
  });

  it("guards against duplicate payment requests and preserves functional backend errors", () => {
    expect(detail).toContain("paymentRequestInFlight.current");
    expect(detail).toContain("setIsPaying(true)");
    expect(detail).toContain('titleFor(action), text: errorText(error)');
    expect(detail).toContain('onClose={() => { if (!isPaying) setShowPayment(false); }}');
  });
});
