import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g,"\n");

const lib = read("src/lib/hotspot/staff-provisioning.ts");
const publicAuth = read("src/app/api/hotspots/staff/authorize/route.ts");
const routerDesired = read("src/app/api/wifi/router/staff/desired/route.ts");
const routerAck = read("src/app/api/wifi/router/staff/ack/route.ts");
const routerSession = read("src/app/api/wifi/router/staff/session/route.ts");
const routerScript = read("routeros/rebuild/41-lbbs-staff-sync.rsc");
const portal = read("routeros/hotspot/portal/lbbs-cautive-staff/login.html");
const stateSql = read("supabase/migrations/20261021152000_hotspot_staff_sync_state_v41.sql");

describe("WiFi Staff phase 41 isolated provisioning and CHAP flow", () => {
  it("keeps all router scripts separate from Clientes and staff WAN disabled", () => {
    expect(routerScript).toContain('name="lbbs-staff-sync"');
    expect(routerScript).toContain('interval=20s disabled=yes');
    expect(routerScript).toContain('[/ip hotspot get $srv disabled] = false');
    expect(routerScript).toContain('LBBS-GATE staff WAN OFF until captive proven');
    expect(routerScript).toContain('server=$staffServer');
    expect(routerScript).not.toContain("/ip hotspot user remove [find]");
    expect(routerScript).not.toContain("/ip hotspot enable");
    expect(routerScript).not.toContain("/ip firewall filter enable");
    expect(routerScript).not.toContain("lbbs-sync\"");
    expect(routerScript).not.toContain("lbbs-hotspot\"");
    expect(routerScript).not.toContain("LBBS-CLIENTES-WAN-AUTH-ONLY");
  });

  it("provisions one MAC-bound router account per pre-approved device", () => {
    expect(lib).toContain('new Set((employees ?? [])');
    expect(lib).toContain('c.is_enabled');
    expect(lib).toContain('d.is_authorized');
    expect(lib).toContain('n > 2');
    expect(lib).toContain('staffMac.test');
    expect(lib).toContain('d.id.replace(/-/g, "")');
    expect(lib).toContain('createHmac("sha256", signingKey())');
    expect(lib).toContain('["LBBS-STAFF-CHAP-V1", routerId, deviceId, codeHash]');
    expect(routerScript).toContain('mac-address=$mac disabled=no');
    expect(routerScript).toContain('comment=$tag');
    expect(routerScript).toContain('profile=$staffProfile');
    expect(routerScript).toContain('LBBSSTAFF:');
    expect(routerScript).toContain('MAC verification failed');
    expect(routerScript).toContain('password or account invalid');
  });

  it("keeps public PIN API fail-closed and never auto-registers MACs", () => {
    expect(publicAuth).toContain('staffEnabled()');
    expect(publicAuth).toContain('verifyStaffPin');
    expect(publicAuth).toContain('staff_auth_attempt');
    expect(publicAuth).toContain('"MAC:" + mac');
    expect(publicAuth).toContain('enroll_hotspot_staff_seen_device_v42');
    expect(publicAuth).toContain('p_router_id: router.id');
    expect(publicAuth).toContain('p_ip: ip');
    expect(publicAuth).toContain('state.revision !== desired.revision');
    expect(publicAuth).toContain("120_000");
    expect(publicAuth).toContain('record.username');
    expect(publicAuth).toContain('record.password');
    expect(publicAuth).not.toContain('authorize_hotspot_staff_device');
    expect(publicAuth).not.toContain('.insert({ credential_id:');
    expect(publicAuth).not.toContain('authorize_hotspot_staff_device');
  });

  it("accepts Staff ACK only for current secure full roster", () => {
    expect(routerDesired).toContain('authenticateRouter');
    expect(routerDesired).toContain('getStaffDesired(auth.router)');
    expect(routerDesired).toContain('"staff-v41"');
    expect(routerAck).toContain("body?.complete !== true");
    expect(routerAck).toContain("snapshot.revision !== body.revision");
    expect(routerAck).toContain('hotspot_staff_sync_state_v41');
    expect(stateSql).toContain('enable row level security');
    expect(stateSql).toContain('revoke all on public.hotspot_staff_sync_state_v41 from public,anon,authenticated');
  });

  it("preserves the branded original Staff portal and renews CHAP challenge", () => {
    expect(portal).toContain('href="staff.css"');
    expect(portal).toContain('assets/lbbs-logo.svg');
    expect(portal).toContain('ROUTER_IDENTIFIER="lbbs-la-bajadita-san-juan"');
    expect(portal).toContain('CLIENT_MAC="$(mac)"');
    expect(portal).toContain('/api/hotspots/staff/authorize');
    expect(portal).toContain('function refreshChallenge()');
    expect(portal).toContain('hexMD5(chap.id+account.password+chap.challenge)');
    expect(portal).toContain('document.sendin.submit()');
    expect(portal).not.toContain('value="pas"');
    expect(portal).not.toContain('hexMD5(chap.id+pin+chap.challenge)');
  });

  it("revokes expired/disabled Staff accounts and clears sessions and cookies only for Staff", () => {
    expect(routerScript).toContain('allowedName = $username');
    expect(routerScript).toContain('hotspot active remove [find where user=$username and server=$staffServer]');
    expect(routerScript).toContain('hotspot cookie remove [find where user=$username]');
    expect(routerSession).toContain('.eq("router_id", auth.router.id)');
    expect(routerSession).toContain('.eq("credential_id", credentialId)');
    expect(routerSession).toContain('.eq("device_id", device.id)');
    expect(routerSession).toContain('event === "LOGIN"');
    expect(routerScript).toContain('on-login={');
    expect(routerScript).toContain('on-logout={');
    expect(routerScript).toContain('login-by=http-chap,mac-cookie');
    expect(routerScript).toContain('add-mac-cookie=yes');
  });
});
