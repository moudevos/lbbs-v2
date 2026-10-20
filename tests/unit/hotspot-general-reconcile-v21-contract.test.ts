import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
const sql = read("supabase/migrations/20261020162500_hotspot_general_reconcile_v21.sql");
const hotfix = read("supabase/migrations/20261020164500_hotspot_general_v21_fix_42702.sql");
const routerApi = read("src/app/api/wifi/router/reconcile/route.ts");
const dashboardApi = read("src/app/api/admin/wifi/vouchers/route.ts");
const dashboard = read("src/features/wifi/WifiPageClient.tsx");
const observer = read("routeros/rebuild/35-lbbs-clientes-presence-v2.rsc");

describe("LBBS Clientes WiFi final v2.1 safety contract", () => {
  it("uses a non-shadowed voucher table alias in the deployed SQL hotfix (42702)", () => {
    expect(hotfix).toContain("from public.wifi_access_vouchers w");
    expect(hotfix).toContain("where w.id = any(p_active_voucher_ids) and w.router_id = p_router_id");
    expect(hotfix).not.toContain("from public.wifi_access_vouchers v\\n       where v.id");
  });
  it("keeps the original 35 wire protocol and SQL v2 observer entirely read-only", () => {
    expect(routerApi).toContain('mode: "observe"');
    expect(routerApi).toContain("p_enforce: false");
    expect(routerApi).toContain("queued: row.queued_count");
    expect(observer).toContain('"enforce"=false');
    expect(observer).toContain('"mode") != "observe"');
    expect(observer).toContain('($body->"queued") != 0');
    expect(routerApi).toContain('"process_hotspot_general_reconcile_v21"');
    expect(routerApi).toContain("autoQueued: safe.auto_queued");
    expect(routerApi).not.toContain("p_enforce: true");
  });

  it("uses a private, disabled-by-default per-router deployment gate", () => {
    expect(sql).toContain("router_id uuid primary key");
    expect(sql).toContain("enabled boolean not null default false");
    expect(sql).toContain("enabled_at timestamptz");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on public.hotspot_general_reconcile_config_v21 from public, anon, authenticated");
    expect(sql).toContain("grant execute on function public.process_hotspot_general_reconcile_v21(uuid,uuid[])");
  });

  it("rejects missing, foreign, duplicated or oversized snapshots", () => {
    expect(sql).toContain("cardinality(p_active_voucher_ids) > 256");
    expect(sql).toContain("array_position(p_active_voucher_ids, null)");
    expect(sql).toContain("count(distinct id)");
    expect(sql).toContain("Foreign voucher in HotSpot general inventory.");
    expect(sql).toContain("where router_id = p_router_id for update");
    expect(sql).toContain("last_snapshot_at < v_now - interval '75 seconds'");
  });

  it("requires post-enable verified presence and sustained 3m+ disconnection", () => {
    expect(sql).toContain("p.last_present_at <= g.enabled_at");
    expect(sql).toContain("p.missing_since > g.enabled_at");
    expect(sql).toContain("p.missing_count >= 4");
    expect(sql).toContain("p.missing_since + interval '3 minutes' <= v_now");
    expect(sql).toContain("p.last_present_at + interval '3 minutes' <= v_now");
    expect(sql).toContain("v_last_login > p.last_present_at");
    expect(sql).toContain("v.id <> all(p_active_voucher_ids)");
    expect(sql).toContain("first_used_at is not null");
    expect(sql).toContain("device_mac is not null");
  });

  it("preserves absolute 3h deadline, idempotent ACK and one queued per poll", () => {
    expect(sql).toContain("v.session_expires_at <= v_now");
    expect(sql).toContain("v.first_used_at + interval '3 hours' <= v_now");
    expect(sql).toContain("g.last_queued_at > v_now - interval '30 seconds'");
    expect(sql).toContain("command_type in ('EXPIRE_VOUCHER', 'REVOKE_VOUCHER')");
    expect(sql).toContain("'expire:' || v.id::text");
    expect(sql).toContain("on conflict (idempotency_key) do nothing");
    expect(sql).toContain("return query select 'enabled'::text, 1");
    expect(sql).not.toContain("update public.wifi_access_vouchers\n");
  });

  it("counts connected devices from recent router presence and not active vouchers", () => {
    expect(dashboardApi).toContain('from("hotspot_client_presence_v2")');
    expect(dashboardApi).toContain('.in("voucher_id", ids)');
    expect(dashboardApi).toContain(".eq(\"router_id\", router.id)");
    expect(dashboardApi).toContain("presence.missing_since");
    expect(dashboardApi).toContain("is_connected: isConnected");
    expect(dashboard).toContain("row.is_connected === true");
    expect(dashboard).toContain("Presencia reciente validada por MikroTik");
    expect(dashboard).not.toContain('const connectedRows = derivedRows.filter((row) => row.effectiveStatus === "active");');
  });
});
