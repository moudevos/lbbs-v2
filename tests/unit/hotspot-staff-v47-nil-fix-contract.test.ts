import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");
const rsc47 = read("routeros/rebuild/47-lbbs-staff-sync-fix-and-verify.rsc");
const rsc46 = read("routeros/rebuild/46-lbbs-staff-sync-stage-patch.rsc");

describe("LBBS47 Staff syncing nil semantics regression", () => {
  it("fixes the invalid RouterOS nil literal comparison that failed v46 on the first device", () => {
    expect(rsc46).toContain('[:find $desiredNames $username] != nil');
    expect(rsc47).not.toContain('[:find $desiredNames $username] != nil');
    expect(rsc47).toContain('[:typeof $duplicateAt] != "nil"');
    expect(rsc47).toContain('duplicate_lookup');
    expect(rsc47).toContain('duplicate_check');
    for (const field of ["username_type", "username_length", "username_prefix",
      "mac_type", "mac_length", "password_type", "password_length",
      "device_id_type", "device_id_length", "credential_id_type", "credential_id_length"]) {
      expect(rsc47).toContain(':set stage "' + field + '"');
    }
  });

  it("makes exactly one controlled manual Staff sync with printed sanitized outcome", () => {
    expect(rsc47).toContain('/system script run lbbs-env');
    expect(rsc47.match(/\/system script run lbbs-staff-sync/g)?.length).toBe(1);
    expect(rsc47).toContain("LBBS47_RESULT=");
    expect(rsc47).toContain("LBBS47_STAFF_USERS=");
    expect(rsc47).toContain("LBBS47_STAFF_HOTSPOT_DISABLED=");
    expect(rsc47).toContain("LBBS47_CLIENTES_DISABLED=");
    expect(rsc47).toContain("LBBS47_SCHEDULER_DISABLED=");
    expect(rsc47).toContain('("failed stage=" . $stage)');
  });

  it("leaves Clientes, firewall, scheduler and Staff HotSpot untouched and fails closed", () => {
    expect(rsc47).toContain('Staff HotSpot must remain DISABLED on bridge-staff');
    expect(rsc47).toContain('Staff scheduler must remain DISABLED');
    expect(rsc47).toContain('Clientes HotSpot must remain operational');
    expect(rsc47).toContain('broad Staff WAN gate must remain DISABLED');
    expect(rsc47).toContain('/system script set $target');
    expect(rsc47).toContain('mac-address=$mac disabled=no comment=$tag');
    expect(rsc47).toContain('server=$staffServer');
    expect(rsc47).toContain('/api/wifi/router/staff/ack');
    expect(rsc47).not.toContain('/ip hotspot enable');
    expect(rsc47).not.toContain('/ip firewall filter enable');
    expect(rsc47).not.toContain('/system scheduler enable');
    expect(rsc47).not.toContain('/system script remove');
    expect(rsc47).not.toContain(':put $secret');
    expect(rsc47).not.toContain(':put $lbbsRouterToken');
  });
});
