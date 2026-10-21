import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(path.join(process.cwd(), name), "utf8");
const setup = read("routeros/rebuild/50-lbbs-staff-pilot-enable.rsc");
const undo = read("routeros/rebuild/50-lbbs-staff-pilot-rollback.rsc");
const login = read("routeros/hotspot/portal/lbbs-cautive-staff/login.html");
const host = read("src/app/api/wifi/router/staff/hosts/route.ts");
const auth = read("src/app/api/hotspots/staff/authorize/route.ts");

describe("WiFi Staff v50 isolated pilot contract", () => {
  it("keeps Clientes enabled and Staff isolated behind authentication", () => {
    expect(setup).toContain('name="lbbs-hotspot"');
    expect(setup).toContain('Clientes not operational');
    expect(setup).toContain('Staff must be disabled on bridge-staff');
    expect(setup).toContain('Staff sync scheduler must be disabled');
    expect(setup).toContain('broad Staff WAN rule must stay disabled');
    expect(setup).toContain('chain="lbbs-staff-v50"');
    expect(setup).toContain('hotspot=auth out-interface=ether1');
    expect(setup).toContain('hotspot=!auth protocol=tcp dst-port=443');
    expect(setup).toContain('dst-address-list="lbbs-staff-v50-api"');
    expect(setup).toContain('dst-host="app.labajaditabarberstudio.com"');
    expect(setup).toContain('comment="LBBS-STAFF-V50-DEFAULT-DROP"');
    expect(setup).toContain('dst-address=10.0.0.0/8');
    expect(setup).toContain('dst-address=172.16.0.0/12');
    expect(setup).toContain('dst-address=192.168.0.0/16');
    expect(setup).toContain('comment="LBBS-STAFF-V50-IPV6-FWD-DROP"');
    expect(setup).toContain('comment="LBBS-STAFF-V50-IPV6-INPUT-DROP"');
    expect(setup).toContain('LBBS50: upload the new fixed Staff login.html before enabling');
    expect(setup).not.toContain('/ip hotspot enable [find]');
    expect(setup).not.toContain('/ip firewall filter enable');
    expect(setup).not.toContain('LBBS-GATE staff WAN OFF until captive proven" action=accept');
  });
  it("checks all branded portal assets then activates the two dedicated schedulers", () => {
    for (const resource of ["login.html","alogin.html","status.html","logout.html","error.html","styles.css","staff.css","md5.js","api.json"]) {
      expect(setup).toContain(resource);
    }
    expect(setup).toContain('name="lbbs-staff-hosts-v42"');
    expect(setup).toContain('interval=10s');
    expect(setup).toContain('LBBS50: host reporter backend check failed');
    expect(setup.indexOf('/ip hotspot enable $staff')).toBeGreaterThan(setup.indexOf('/ip firewall filter add chain=forward'));
    expect(setup.indexOf('/ip hotspot enable $staff')).toBeGreaterThan(setup.indexOf('/system scheduler enable $hostsScheduler'));
    expect(setup).toContain('LBBS50_PILOT=enabled');
  });
  it("keeps Staff session tracking compatible with the v49 96-character version tag", () => {
    expect(setup).toContain('[:len $tag] = 96');
    expect(setup).toContain(':pick $tag 10 46');
    expect(setup).toContain(':pick $tag 47 83');
    expect(setup).toContain('/api/wifi/router/staff/session');
    expect(setup).not.toContain('[:len $tag] = 83');
  });
  it("has an exact-tagged rollback that never changes Clientes", () => {
    const tagNames = [
      "FWD-JUMP", "INPUT-MGMT-DROP", "PRIVATE-10", "PRIVATE-172",
      "PRIVATE-192", "PREAUTH-API", "AUTH-WAN", "DEFAULT-DROP",
      "NAT", "WALLED-API", "API-DNS", "IPV6-FWD-DROP", "IPV6-INPUT-DROP",
    ];
    for (const label of tagNames) {
      expect(setup).toContain("LBBS-STAFF-V50-" + label);
      expect(undo).toContain("LBBS-STAFF-V50-" + label);
    }
    expect(undo).toContain('/ip hotspot disable $st');
    expect(undo).toContain('/system scheduler disable $ss');
    expect(undo).toContain('/system scheduler disable $hs');
    expect(undo).not.toContain('/ip hotspot disable [find where name="lbbs-hotspot"]');
    expect(undo).not.toContain('/ip firewall filter remove [find]');
  });
  it("uses trusted MAC+IP reported from RouterOS and a syntactically valid portal", () => {
    expect(login).toContain('CLIENT_MAC="$(mac)"');
    expect(login).toContain('CLIENT_IP="$(ip)"');
    expect(login).toContain('LBBS-STAFF-PILOT-V50');
    expect(login).toContain('/api/hotspots/staff/authorize');
    expect(login).toContain('hexMD5(chap.id+account.password+chap.challenge)');
    expect(login).not.toContain('){\\n    showErr');
    expect(host).toContain('authenticateRouter(request)');
    expect(auth).toContain('enroll_hotspot_staff_seen_device_v42');
    expect(auth).toContain('state.revision !== desired.revision');
  });
});