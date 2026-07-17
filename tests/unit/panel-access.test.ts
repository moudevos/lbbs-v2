import { describe, expect, it } from "vitest";

import { canHavePanelAccess } from "@/lib/auth/panel-access";

describe("acceso al panel", () => {
  it("solo permite login para owner, admin y recepcion", () => {
    expect(canHavePanelAccess("owner")).toBe(true);
    expect(canHavePanelAccess("admin")).toBe(true);
    expect(canHavePanelAccess("reception")).toBe(true);
    expect(canHavePanelAccess("barber")).toBe(false);
    expect(canHavePanelAccess("viewer")).toBe(false);
  });
});
