import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const file = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const sql = file("supabase/migrations/20261021163500_hotspot_staff_seen_host_autotrust_v42.sql");
const hosts = file("src/app/api/wifi/router/staff/hosts/route.ts");
const auth = file("src/app/api/hotspots/staff/authorize/route.ts");
const portal = file("routeros/hotspot/portal/lbbs-cautive-staff/login.html");
const router = file("routeros/rebuild/42-lbbs-staff-host-attestation.rsc");
const ui = file("src/features/wifi/WifiStaffPanel.tsx");
const admin = file("src/app/api/admin/wifi/staff/route.ts");

describe("Staff v42: first-two auto trusted devices", () => {
  it("accepts host evidence only from the authenticated Staff router, never from browsers", () => {
    expect(hosts).toContain("authenticateRouter(request)");
    expect(hosts).toContain("staffEnabled()");
    expect(hosts).toContain('staffMac.test(mac)');
    expect(hosts).toContain("ipPattern.test(ipValue)");
    expect(hosts).toContain('"hotspot_staff_seen_hosts_v42"');
    expect(hosts).toContain("router_id: authenticated.router.id");
    expect(hosts).toContain("if (list.length > 96)");
    expect(hosts).not.toContain("authorization: true");
    expect(router).toContain('/ip hotspot host find where server="lbbs-staff-hotspot"');
    expect(router).toContain('value={"hosts"=$observed}');
    expect(router).toContain('disabled=yes');
    expect(router).not.toContain("/ip hotspot enable");
    expect(router).not.toContain("/ip firewall filter enable");
    expect(router).not.toContain("lbbs-hotspot\"");
  });
  it("locks credential and checks same router+MAC+IP observed recently", () => {
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('to service_role');
    expect(sql).toContain('security invoker');
    expect(sql).toContain('for update of c');
    expect(sql).toContain('r.id=p_router_id');
    expect(sql).toContain('h.router_id=p_router_id');
    expect(sql).toContain('h.mac_address=v_mac');
    expect(sql).toContain('h.ip_address=p_ip');
    expect(sql).toContain("interval '75 seconds'");
    expect(sql).toContain('insert into public.hotspot_staff_devices');
    expect(sql).toContain('if not v_enabled then');
    expect(sql).toContain('Device revoked by administrator');
    expect(sql).toContain('if v_count>2');
    expect(sql).toContain("raise exception");
  });
  it("only attempts auto-enrollment after PIN verification and identity rate-limits", () => {
    expect(auth).toContain("verifyStaffPin");
    expect(auth).toContain('staff_auth_attempt');
    expect(auth).toContain("!pinValid");
    expect(auth).toContain('enroll_hotspot_staff_seen_device_v42');
    expect(auth.indexOf("!pinValid")).toBeLessThan(auth.indexOf('enroll_hotspot_staff_seen_device_v42'));
    expect(auth).toContain('p_ip: ip');
    expect(auth).toContain('state.revision !== desired.revision');
    expect(auth).not.toContain('authorize_hotspot_staff_device');
  });
  it("uses router-assigned MAC/IP and preserves CHAP flow", () => {
    expect(portal).toContain('CLIENT_MAC="$(mac)"');
    expect(portal).toContain('CLIENT_IP="$(ip)"');
    expect(portal).toContain('mac:CLIENT_MAC');
    expect(portal).toContain('ip:CLIENT_IP');
    expect(portal).toContain('hexMD5(chap.id+account.password+chap.challenge)');
    expect(portal).not.toContain('prompt("Dirección MAC');
  });
  it("lets administrator revoke and frees one slot without manual registration", () => {
    expect(ui).toContain('Alta automática:');
    expect(ui).toContain('Revocar');
    expect(ui).toContain('Revocado');
    expect(ui).toContain('2 - c.devices.filter');
    expect(ui).not.toContain('window.prompt("Dirección MAC');
    expect(admin).toContain('body.action === "revoke_device"');
    expect(admin).not.toContain('body.action === "register_device"');
  });
});
