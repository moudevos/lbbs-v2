import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
const file = (pathName: string) => readFileSync(path.join(process.cwd(), pathName), "utf8");

const staged = file("routeros/rebuild/48-lbbs-staff-sync-finalize-and-ack.rsc");
const prior = file("routeros/rebuild/47-lbbs-staff-sync-fix-and-verify.rsc");

describe("LBBS48 Staff credentials verification and ACK", () => {
  it("repairs the earlier sensitive-password readback failure", () => {
    expect(prior).toContain("get $check password");
    expect(staged).not.toContain("get $check password");
    expect(staged).not.toContain("get $userIds password");
    for (const step of ["verify_exists", "verify_mac", "verify_profile", "verify_disabled", "verify_comment", "verify_revision", "send_ack"]) {
      expect(staged).toContain(':set stage "' + step + '"');
    }
    expect(staged).toContain("LBBS48_RESULT=");
  });
  it("persists Staff-only revision without disconnecting established devices on every poll", () => {
    expect(staged).toContain(':local revisionMarker ("sync-" . $revision . "@lbbs.invalid")');
    expect(staged).toContain('[:len $userIds] = 0');
    expect(staged).toContain('email=$revisionMarker');
    expect(staged).toContain('$previousMarker != $revisionMarker');
    expect(staged).toContain('[/ip hotspot user get $check email]');
    expect(staged).toContain('mac-address=$mac');
    expect(staged).toContain('server=$staffServer');
    expect(staged).toContain('comment=$tag');
  });
  it("runs exactly one manual sync and maintains fail-closed, no Clientes mutations", () => {
    expect((staged.match(/\/system script run lbbs-staff-sync/g) ?? []).length).toBe(1);
    expect(staged).toContain('Staff HotSpot must remain DISABLED');
    expect(staged).toContain('Clientes HotSpot must remain operational');
    expect(staged).toContain('Staff scheduler must remain DISABLED');
    expect(staged).toContain('broad Staff WAN gate must remain DISABLED');
    expect(staged).not.toContain('/ip hotspot enable');
    expect(staged).not.toContain('/system scheduler enable');
    expect(staged).not.toContain('/ip firewall filter enable');
    expect(staged).not.toContain(':put $secret');
    expect(staged).not.toContain(':put $lbbsRouterToken');
    expect(staged).toContain('LBBS48_STAFF_USERS=');
    expect(staged).not.toContain('print count-only');
  });
});
