import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = () => readFileSync(path.resolve(process.cwd(), "routeros/rebuild/31-lbbs-client-login-events.rsc"), "utf8");

describe("LBBS Clients - recording real MikroTik logins", () => {
  it("records only genuine HotSpot user login with tagged voucher via authenticated HTTPS", () => {
    const script = source();
    expect(script).toContain('name="lbbs-client-profile"');
    expect(script).toContain('name="lbbs-hotspot"');
    expect(script).toContain('"/api/wifi/router/session"');
    expect(script).toContain('check-certificate=yes');
    expect(script).toContain('LBBS:');
    expect(script).toContain('hotspot_on_login');
    expect(script).toContain('lbbs31_reconciliation');
    expect(script).toContain('"LOGIN"');
    expect(script).toContain('confirmed active sessions=');
  });

  it("does not prematurely expire vouchers or widen client internet access", () => {
    const script = source();
    expect(script).not.toContain('on-logout=$');
    expect(script).not.toContain('on-logout=\"');
    expect(script).not.toContain('add-mac-cookie=yes');
    expect(script).not.toContain('/ip firewall');
    expect(script).not.toContain('/ip hotspot user remove');
    expect(script).not.toContain('LBBS-GATE customer WAN');
    expect(script).not.toContain('/ip hotspot cookie remove');
    expect(script).not.toContain('lbbs_rt_');
  });
});
