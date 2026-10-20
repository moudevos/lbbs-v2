import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("LBBS Clientes - gated WAN pilot", () => {
  it("permits only authenticated HotSpot traffic to Starlink without opening the broad gate", () => {
    const script = readFileSync(path.join(process.cwd(), "routeros/rebuild/32-lbbs-clientes-wan-auth-only.rsc"), "utf8");
    expect(script).toContain('hotspot=auth');
    expect(script).toContain('in-interface=bridge-hotspot');
    expect(script).toContain('out-interface=ether1');
    expect(script).toContain('src-address=10.10.10.0/24');
    expect(script).toContain('place-before=[find where comment="LBBS captive preauth HTTPS exception"]');
    expect(script).toContain('comment="LBBS-CLIENTES-WAN-AUTH-ONLY"');
    expect(script).toContain('LBBS-BOOT-Forward-Drop');
    expect(script).toContain('and disabled=yes');
    expect(script).not.toContain('/ip firewall filter enable');
    expect(script).not.toContain('action=masquerade');
    expect(script).not.toContain('/ip firewall filter remove');
    expect(script).not.toContain('/ip hotspot user remove');
  });
});
