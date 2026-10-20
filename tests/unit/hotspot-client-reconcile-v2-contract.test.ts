import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");
const api = read("src/app/api/wifi/router/reconcile/route.ts");
const sql = read("supabase/migrations/20261020131500_hotspot_reconcile_v2_safe.sql");
const router = read("routeros/rebuild/35-lbbs-clientes-presence-v2.rsc");

describe("LBBS WiFi Clientes v2 - staged observation and no instant expiry", () => {
  it("locks the broad observer in no-enforcement mode", () => {
    expect(api).toContain("authenticateRouter(request)");
    expect(api).toContain("body?.enforce !== undefined && body.enforce !== false");
    expect(api).toContain("p_enforce: false");
    expect(api).toContain('mode: "observe"');
    expect(api).not.toContain("HOTSPOT_RECONCILE_V2_ENFORCE");
    expect(api).not.toContain("record_hotspot_session_event");
  });

  it("rejects truncated or foreign inventory and locks each active voucher", () => {
    expect(sql).toContain("cardinality(p_active_voucher_ids) > 256");
    expect(sql).toContain("Snapshot contains unknown or foreign voucher IDs");
    expect(sql).toContain("order by id for update");
    expect(sql).toContain("p.last_present_at is null");
    expect(sql).toContain("v_last_login > p.last_present_at");
  });

  it("requires prior positive sighting and sustained absence for 3min", () => {
    expect(sql).toContain("last_present_at");
    expect(sql).toContain("missing_since");
    expect(sql).toContain("missing_count");
    expect(sql).toContain("v_now >= p.missing_since + interval '3 minutes'");
    expect(sql).toContain("v_now >= p.last_present_at + interval '3 minutes'");
    expect(sql).toContain("p.missing_count + 1 >= 4");
    expect(sql).toContain("p.last_snapshot_at < v_now - interval '90 seconds'");
    expect(sql).toContain("v_now >= v_last_login + interval '3 minutes'");
  });

  it("preserves the fixed first-login expiration independent from presence", () => {
    expect(sql).toContain("v.session_expires_at <= v_now");
    expect(sql).toContain("v.first_used_at + interval '3 hours' <= v_now");
    expect(sql).toContain("v_reason := 'absolute_deadline'");
  });

  it("only marks Dashboard expired after the RouterOS EXPIRE command is acknowledged", () => {
    expect(sql).toContain("after update of status on public.hotspot_router_commands");
    expect(sql).toContain("new.status = 'applied'");
    expect(sql).toContain("set status = 'expired'");
    expect(sql).toContain("'SESSION_EXPIRED'");
    expect(sql).toContain("grant execute on function public.reconcile_hotspot_client_sessions_v2(uuid,uuid[],boolean)");
    expect(sql).toContain("enable row level security");
  });

  it("never enables enforcement or the timer during RouterOS install", () => {
    expect(router).toContain('name="lbbs-presence-v2" interval=30s');
    expect(router).toContain('disabled=yes');
    expect(router).toContain('"enforce"=false');
    expect(router).toContain('"mode") != "observe"');
    expect(router).toContain('($body->"queued") != 0');
    expect(router).toContain('name="lbbs-reconcile" and disabled=no');
    expect(router).toContain(":foreach seenId in=$ids");
    expect(router).not.toContain("/ip hotspot user remove");
    expect(router).not.toContain("/ip firewall filter enable");
    expect(router).not.toContain("add-mac-cookie=yes");
  });
});
