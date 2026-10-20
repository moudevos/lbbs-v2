import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = (name: string) => readFileSync(path.join(process.cwd(), name), "utf8");
const migration = source("supabase/migrations/20261020145000_hotspot_reconcile_one_voucher_canary.sql");
const canaryRoute = source("src/app/api/wifi/router/reconcile/canary/route.ts");
const regularRoute = source("src/app/api/wifi/router/reconcile/route.ts");
const installer = source("routeros/rebuild/36-lbbs-clientes-single-canary.rsc");

describe("LBBS one-voucher canary safety", () => {
  it("keeps normal snapshot endpoint observation only, regardless of environment", () => {
    expect(regularRoute).toContain("p_enforce: false");
    expect(regularRoute).toContain('mode: "observe"');
    expect(regularRoute).not.toContain('process.env.HOTSPOT_RECONCILE_V2_ENFORCE');
    expect(regularRoute).toContain("body?.enforce !== false");
  });

  it("requires signed RouterOS auth, explicit canary intent and a valid inventory", () => {
    expect(canaryRoute).toContain("authenticateRouter(request)");
    expect(canaryRoute).toContain("body?.canary !== true");
    expect(canaryRoute).toContain("body?.enforce !== false");
    expect(canaryRoute).toContain("values.length > 256");
    expect(canaryRoute).toContain("new Set(activeIds).size !== activeIds.length");
    expect(canaryRoute).toContain('p_enforce: false');
    expect(canaryRoute).toContain('"process_hotspot_client_canary_v1"');
    expect(canaryRoute).not.toContain("voucherId: body.");
  });

  it("refuses to arm a voucher automatically and limits one target per router", () => {
    expect(migration).toContain("router_id uuid primary key");
    expect(migration).toContain("voucher_id uuid not null unique");
    expect(migration).toContain("enabled boolean not null default false");
    expect(migration).toContain("expires_at <= armed_at + interval '45 minutes'");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on public.hotspot_reconcile_canary_v1 from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.process_hotspot_client_canary_v1");
  });

  it("requires a new positive observation after arming and sustained offline grace", () => {
    expect(migration).toContain("p.last_present_at <= c.armed_at");
    expect(migration).toContain("p.missing_since <= c.armed_at");
    expect(migration).toContain("p.missing_count < 4");
    expect(migration).toContain("p.last_snapshot_at < v_now - interval '75 seconds'");
    expect(migration).toContain("p.missing_since + interval '3 minutes' > v_now");
    expect(migration).toContain("v_last_login > p.last_present_at");
    expect(migration).toContain("c.voucher_id = any(p_active_voucher_ids)");
  });

  it("queues at most one voucher, never expires other users, and disarms atomically", () => {
    expect(migration).toContain("values (\n    p_router_id, c.voucher_id, 'EXPIRE_VOUCHER'");
    expect(migration).toContain("'expire:' || c.voucher_id::text");
    expect(migration).toContain("set enabled=false, command_queued_at=v_now");
    expect(migration).toContain("return query select 'queued'::text, 1");
    expect(migration).toContain("prior_expiry_command");
    expect(canaryRoute).toContain("result.queued_count > 1");
  });

  it("installs the RouterOS canary disabled, explicit, and one-shot", () => {
    expect(installer).toContain('name="lbbs-canary-v1" interval=30s');
    expect(installer).toContain("disabled=yes");
    expect(installer).toContain('"enforce"=false;"canary"=true');
    expect(installer).toContain("/api/wifi/router/reconcile/canary");
    expect(installer).toContain('name="lbbs-reconcile" and disabled=no');
    expect(installer).toContain('/system scheduler disable [find where name="lbbs-canary-v1"]');
    expect(installer).not.toContain("/ip hotspot user remove");
    expect(installer).not.toContain("/ip firewall filter");
    expect(installer).not.toContain("lbbsRouterToken]");
  });
});
