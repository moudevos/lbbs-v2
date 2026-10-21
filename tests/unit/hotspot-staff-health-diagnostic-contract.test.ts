import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

describe("LBBS Staff safe health diagnosis", () => {
  const route = read("src/app/api/wifi/router/staff/health/route.ts");
  const script = read("routeros/rebuild/43-lbbs-staff-safe-health.rsc");

  it("requires router authentication before reporting non-secret configuration status", () => {
    expect(route).toContain("authenticateRouter(request)");
    expect(route.indexOf("authenticateRouter(request)")).toBeLessThan(route.indexOf("process.env.HOTSPOT_STAFF_PROVISIONING_KEY"));
    expect(route).toContain('state = "flag_disabled"');
    expect(route).toContain('state = "provisioning_key_invalid"');
    expect(route).toContain('state = "snapshot_unavailable"');
    expect(route).toContain('state = "ready"');
    expect(route).toContain('Buffer.from(key, "base64").length === 32');
    expect(route).toContain('Cache-Control": "no-store"');
    expect(route).not.toContain('JSON.stringify(process.env)');
    expect(route).not.toContain('device: snapshot.devices');
    expect(route).not.toContain('password:');
  });

  it("never displays tokens, individual MAC addresses or serialized router roster", () => {
    expect(script).toContain("/api/wifi/router/staff/health");
    expect(script).toContain("check-certificate=yes");
    expect(script).toContain("staff_health_state=");
    expect(script).toContain("staff_failed_stage=");
    expect(script).toContain("http_401_router_token");
    expect(script).toContain("http_404_endpoint_not_deployed");
    expect(script).toContain("certificate_or_tls");
    expect(script).not.toContain(":put $lbbsRouterToken");
    expect(script).not.toContain(":put $errText");
    expect(script).not.toContain(":put ($fetched->\"data\")");
    expect(script).not.toContain("/ip hotspot set");
    expect(script).not.toContain("/ip firewall");
    expect(script).not.toContain("/system scheduler");
  });
});
