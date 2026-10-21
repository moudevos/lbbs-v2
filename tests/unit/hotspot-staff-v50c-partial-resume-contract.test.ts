import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
const r = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

const resume = r("routeros/rebuild/50c-lbbs-staff-pilot-resume.rsc");
const rollback = r("routeros/rebuild/50c-lbbs-staff-pilot-rollback.rsc");
const original = r("routeros/rebuild/50b-lbbs-staff-pilot-enable-fixed.rsc");
const login = r("routeros/hotspot/portal/lbbs-cautive-staff/login.html");

describe("LBBS v50c partial pilot continuation", () => {
 it("reproduces the exact line-144 failure and avoids place-before=0 on empty IPv6 filter", () => {
  expect(original.split("\n")[143]).toContain("/ipv6 firewall filter add");
  expect(original.split("\n")[143]).toContain("place-before=0");
  expect(resume).toContain('[:len $first6] = 0');
  expect(resume).toContain('[:len $first6b] = 0');
  expect(resume).toContain('place-before=($first6->0)');
  expect(resume).toContain('place-before=($first6b->0)');
  expect(resume).toContain("LBBS-STAFF-V50-IPV6-FWD-DROP");
  expect(resume).toContain("LBBS-STAFF-V50-IPV6-INPUT-DROP");
  expect(resume).not.toMatch(/^\s*\/ipv6 firewall filter add .*place-before=0/m);
 });
 it("never repeats partially completed IPv4 install or reconfigures Clientes", () => {
  expect(resume).toContain('existing IPv4 Staff jump missing');
  expect(resume).toContain('Staff API preauth missing');
  expect(resume).toContain('Staff captive API walled garden missing');
  expect(resume).not.toContain('LBBS-STAFF-V50-FWD-JUMP"\\n/ip firewall filter add');
  expect(resume).not.toContain('chain=forward action=jump');
  expect(resume).not.toContain('/ip firewall filter remove');
  expect(resume).not.toContain('/system scheduler add');
  expect(resume).not.toContain('/ip hotspot add');
  expect(resume).not.toContain('/ip hotspot set');
  expect(resume).not.toContain('/ip firewall nat remove');
  expect(resume).not.toContain('lbbs-sync"');
  expect(resume).toContain('LBBS50c_CLIENTES_DISABLED=');
 });
 it("only opens Staff at the end and can reverse every owned rule", () => {
  const enableAt = resume.indexOf("/ip hotspot enable $staff");
  expect(enableAt).toBeGreaterThan(resume.indexOf('LBBS-STAFF-V50-NAT'));
  expect(enableAt).toBeGreaterThan(resume.indexOf('LBBS-STAFF-V50-IPV6-INPUT-DROP'));
  expect(resume).toContain('/system scheduler enable $syncScheduler');
  expect(resume).toContain('/system scheduler enable $hostScheduler');
  for (const tag of [...new Set([...resume.matchAll(/comment="(LBBS-STAFF-V50-[A-Z0-9-]+)"/g)].map(m => m[1]))]) {
   expect(rollback).toContain(tag);
  }
  expect(rollback).toContain('/ip hotspot disable $st');
  expect(rollback).not.toContain('/ip hotspot disable [find where name="lbbs-hotspot"]');
  expect(rollback).not.toContain('/ip firewall filter disable [find]');
 });
 it("uses the corrected, valid captive JavaScript with MAC/IP auto-trust", () => {
  expect(login).toContain('CLIENT_MAC="$(mac)"');
  expect(login).toContain('CLIENT_IP="$(ip)"');
  expect(login).toContain('hexMD5(chap.id+account.password+chap.challenge)');
  expect(login).not.toContain(';\\\\n  }');
 });
});
