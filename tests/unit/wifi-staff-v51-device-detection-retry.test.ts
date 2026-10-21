import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const route = readFileSync("src/app/api/hotspots/staff/authorize/route.ts","utf8");

describe("Staff v51: wait for authenticated router to observe first device",()=>{
 it("checks PIN and rate-limits before allowing any retry on host presence",()=>{
   expect(route.indexOf("!pinValid")).toBeGreaterThan(-1);
   expect(route.indexOf("!pinValid")).toBeLessThan(route.indexOf("Device not observed on Staff AP"));
   expect(route).toContain('enrollment.error.code === "23514"');
   expect(route).toContain('retryAfterSeconds: 2');
   expect(route).toContain('"Retry-After": "2"');
   expect(route).toContain('{ status: 409,');
 });
 it("never auto-trusts an unobserved MAC and still denies revoked / third devices",()=>{
   expect(route).toContain('enroll_hotspot_staff_seen_device_v42');
   expect(route).toContain('p_router_id: router.id');
   expect(route).toContain('p_ip: ip');
   expect(route).toContain('["23514", "23505"]');
   expect(route).not.toContain('.insert({ credential_id:');
 });
});
