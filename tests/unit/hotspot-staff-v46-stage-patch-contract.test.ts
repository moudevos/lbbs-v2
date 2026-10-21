import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const load = (name: string) => readFileSync(path.join(process.cwd(), name), "utf8");
const patch = load("routeros/rebuild/46-lbbs-staff-sync-stage-patch.rsc");
const rollback = load("routeros/rebuild/46-lbbs-staff-sync-rollback.rsc");
const original = load("routeros/rebuild/41-lbbs-staff-sync.rsc");

describe("RouterOS Staff sync patch 46", () => {
  it("updates only the preexisting Staff synchronizer while schedulers remain disabled", () => {
    expect(patch).toContain('find where name="lbbs-staff-sync"');
    expect(patch).toContain('find where name="lbbs-staff-hotspot"');
    expect(patch).toContain('find where name="lbbs-hotspot"');
    expect(patch).toContain('Staff sync scheduler first');
    expect(patch).toContain('Staff HotSpot must remain disabled');
    expect(patch).toContain('Staff WAN broad gate must stay disabled');
    expect(patch).toContain('/system script set $target');
    expect(patch).not.toContain('/system script run');
    expect(patch).not.toContain('/system scheduler enable');
    expect(patch).not.toContain('/ip firewall filter enable');
    expect(patch).not.toContain('/ip hotspot enable');
    expect(patch).not.toContain('/ip hotspot add');
    expect(patch).not.toContain('/system script remove');
    expect(patch).not.toContain('/ip hotspot user remove [find]');
  });
  it("retains Staff-only provisioning, revocation, and full-roster acknowledgement", () => {
    expect(patch).toContain('server=$staffServer');
    expect(patch).toContain('mac-address=$mac disabled=no comment=$tag');
    expect(patch).toContain(':set stage "create_staff_user"');
    expect(patch).toContain(':set stage "update_staff_user"');
    expect(patch).toContain(':set stage "verify_staff_user"');
    expect(patch).toContain(':set stage "revoke_obsolete_users"');
    expect(patch).toContain(':set stage "send_ack"');
    expect(patch).toContain('/api/wifi/router/staff/desired');
    expect(patch).toContain('/api/wifi/router/staff/ack');
    expect(patch).toContain('check-certificate=yes');
    expect(patch).toContain('staffServer "lbbs-staff-hotspot"');
  });
  it("reports sanitized failure stage, never dumps credential or token values", () => {
    expect(patch).toContain(':onerror syncFailure in={');
    expect(patch).toContain('("failed stage=" . $stage)');
    expect(patch).toContain('no successful ACK');
    expect(patch).not.toContain(':log warning $syncFailure');
    expect(patch).not.toContain(':put $syncFailure');
    expect(patch).not.toContain(':put $lbbsRouterToken');
    expect(patch).not.toContain(':put $secret');
    expect(patch).not.toContain('lbbs_rt_');
  });
  it("rollback restores exact original v41 script body without running it", () => {
    const prefix = '/system script add name="lbbs-staff-sync" policy=ftp,read,write,policy,test,sensitive source={';
    const suffix = '\n}\n\n# This scheduler remains disabled';
    const begin = original.indexOf(prefix);
    const end = original.indexOf(suffix, begin);
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(begin);
    const originalBody = original.slice(begin + prefix.length, end);
    expect(rollback).toContain(originalBody);
    expect(rollback).toContain('/system script set $target');
    expect(rollback).not.toContain('/system script run');
  });
});
