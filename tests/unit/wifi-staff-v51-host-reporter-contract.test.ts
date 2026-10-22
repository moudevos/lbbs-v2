import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
const rsc = readFileSync(path.join(process.cwd(), "routeros/rebuild/51-lbbs-staff-host-reporter-fix.rsc"), "utf8");
const api = readFileSync(path.join(process.cwd(), "src/app/api/wifi/router/staff/hosts/route.ts"), "utf8");

describe("LBBS51 Staff host reporter repair", () => {
  it("avoids writing an associative key into RouterOS numeric array at host_read", () => {
    expect(rsc).toContain("LBBS51_HOSTS=");
    expect(rsc).toContain("LBBS51_HOST_ENTRIES=");
    expect(rsc).toContain(':set stage "read_mac"');
    expect(rsc).toContain(':set stage "read_ip"');
    expect(rsc).toContain(':set stage "append_host"');
    expect(rsc).toContain(':set json ($json . "\"" . $mac . "\":\"" . $ip . "\"")');
    expect(rsc).not.toContain('($observed->$mac)');
    expect(api).toContain("Object.entries(hosts)");
    expect(api).toContain("authenticateRouter(request)");
    expect(api).toContain("router_id: authenticated.router.id");
  });
  it("updates only Staff script and does not modify bridge, firewall, NAT or Clientes", () => {
    expect(rsc).toContain('find where name="lbbs-staff-hosts-v42"');
    expect(rsc).toContain('/system script set $script');
    expect(rsc).toContain('/system scheduler disable $scheduler');
    expect(rsc).toContain('/system script run lbbs-staff-hosts-v42');
    expect(rsc).toContain('LBBS51_CLIENTES_DISABLED=');
    expect(rsc).not.toContain('/ip hotspot enable');
    expect(rsc).not.toContain('/ip firewall filter add');
    expect(rsc).not.toContain('/ip firewall filter remove');
    expect(rsc).not.toContain('/ip firewall nat');
    expect(rsc).not.toContain('/ip hotspot user add');
    expect(rsc).not.toContain(':put $lbbsRouterToken');
    expect(rsc).not.toContain(':put $mac');
  });
});
