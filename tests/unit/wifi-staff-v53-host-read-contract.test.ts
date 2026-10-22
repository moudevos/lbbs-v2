import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const v52 = readFileSync("routeros/rebuild/52-lbbs-staff-host-reporter.rsc", "utf8");
const v53 = readFileSync("routeros/rebuild/53-lbbs-staff-host-reader-fix.rsc", "utf8");
describe("Staff v53 host reader hotfix", () => {
  it("fixes the actual read_mac crash without trusting browser-provided identity", () => {
    expect(v52).toContain(':toupper [:tostr ($row->"mac-address")]');
    expect(v53).not.toContain(":toupper");
    expect(v53).toContain(':local mac [:tostr ($row->"mac-address")]');
    expect(v53).toContain(':local ip [:tostr ($row->"address")]');
    expect(v53).toContain('/ip hotspot host print as-value where server="lbbs-staff-hotspot"');
    expect(v53).toContain('if ([:len $mac] = 17 && [:pick $ip 0 9] = "10.10.20.")');
    expect(v53).toContain("/api/wifi/router/staff/hosts");
    expect(v53).toContain("check-certificate=yes");
  });
  it("recovers the Staff-only scheduler on successful report, without touching Clientes", () => {
    expect(v53).toContain(':if ([:pick $lbbsStaffHostsResult 0 8] = "ok seen=") do={');
    expect(v53).toContain('/system scheduler enable $scheduler');
    expect(v53).toContain(':if ([/ip hotspot get $clients disabled] = true)');
    expect(v53).toContain('[/ip hotspot get $staff interface] != "bridge-staff"');
    expect(v53).not.toContain("/ip firewall");
    expect(v53).not.toContain("/ip hotspot user add");
    expect(v53).not.toContain("/ip hotspot enable");
    expect(v53).not.toContain("lbbs-sync\"");
    expect(v53).not.toContain(":put $lbbsRouterToken");
    expect(v53).toContain('LBBS53_HOSTS=');
  });
});
