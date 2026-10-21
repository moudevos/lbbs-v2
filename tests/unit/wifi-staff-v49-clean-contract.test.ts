import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");
const script = read("routeros/rebuild/49-lbbs-staff-reset-and-reconcile.rsc");
const desired = read("src/lib/hotspot/staff-provisioning.ts");
const admin = read("src/app/api/admin/wifi/staff/route.ts");

describe("Staff 49: clear orphan Staff users safely and reconcile by MAC", () => {
 it("uses only the dedicated Staff server, with fail-closed production protections", () => {
  expect(script).toContain('server="lbbs-staff-hotspot"');
  expect(script).toContain('comment~"^LBBSSTAFF:"');
  expect(script).toContain('Staff HotSpot must remain');
  expect(script).toContain('Staff scheduler must stay disabled');
  expect(script).toContain('Clientes must remain active');
  expect(script).toContain('broad Staff WAN gate enabled');
  expect(script).not.toContain('/ip hotspot enable');
  expect(script).not.toContain('/ip firewall filter enable');
  expect(script).not.toContain('/system scheduler enable');
  expect(script).not.toContain('/ip hotspot user remove [find]');
 });
 it("matches current device credentials, avoids reading sensitive password and preserves unchanged users", () => {
  expect(script).toContain('comment=$tag and mac-address=$mac and profile=$staffProfile and disabled=no');
  expect(script).toContain('[:len $exact] != 1');
  expect(script).toContain('foreign_username_collision');
  expect(script).toContain('[:typeof $member] = "nil"');
  expect(script).not.toContain('get $owned comment');
  expect(script).not.toContain('get $owned password');
  expect(script).not.toContain('get $check password');
  expect(script).not.toContain('email=');
  expect(script).toContain('stage "ack"');
  expect(script).toContain('LBBS49_SYNC=');
 });
 it("rotates only device-specific technical accounts and supports clean admin creation", () => {
  expect(desired).toContain('syncTag: "LBBSSTAFF:"');
  expect(desired).toContain('credential.id + ":" + d.id');
  expect(desired).toContain('credential.code_hash');
  expect(desired).toContain('createHash("sha256")');
  expect(admin).toContain('body.action === "revoke_device"');
  expect(admin).not.toContain('body.action === "register_device"');
  expect(admin).toContain('from("hotspot_staff_credentials").insert');
 });
});