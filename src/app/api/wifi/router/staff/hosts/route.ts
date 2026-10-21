import { NextResponse } from "next/server";
import { authenticateRouter } from "@/lib/hotspot/router-auth";
import { staffEnabled, staffMac } from "@/lib/hotspot/staff-provisioning";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const ipPattern = /^10\.10\.20\.(?:[1-9]|[1-9]\d|1\d\d|2[0-4]\d|25[0-4])$/;
const headers = { "Cache-Control": "no-store" };

// Physical presence is reported ONLY by the authenticated MikroTik (not browser).
// Router filters /ip hotspot host by the dedicated Staff server.
export async function POST(request: Request) {
  const authenticated = await authenticateRouter(request);
  if (!authenticated.ok)
    return NextResponse.json({ error: "Router no autorizado." }, { status: authenticated.status });
  if (!staffEnabled())
    return NextResponse.json({ error: "Staff deshabilitado." }, { status: 503, headers });

  const body = await request.json().catch(() => null);
  const hosts = body?.hosts;
  // RouterOS serializes an empty dictionary as [] on some v7 builds.
  // Accept only that empty-array special case; nonempty arrays are invalid.
  if (!hosts || typeof hosts !== "object" ||
      (Array.isArray(hosts) && hosts.length > 0))
    return NextResponse.json({ error: "Host snapshot inválido." }, { status: 400, headers });
  const list = Array.isArray(hosts) ? [] : Object.entries(hosts);
  if (list.length > 96)
    return NextResponse.json({ error: "Demasiados hosts Staff." }, { status: 413, headers });
  const rows: { router_id: string; mac_address: string; ip_address: string; observed_at: string }[] = [];
  const seen = new Set<string>();
  const observedAt = new Date().toISOString();
  for (const [macValue, ipValue] of list) {
    const mac = macValue.toUpperCase();
    if (!staffMac.test(mac) || typeof ipValue !== "string" || !ipPattern.test(ipValue)) {
      return NextResponse.json({ error: "Host Staff inválido." }, { status: 400, headers });
    }
    const pair = mac + ":" + ipValue;
    if (seen.has(pair)) continue;
    seen.add(pair);
    rows.push({ router_id: authenticated.router.id, mac_address: mac,
      ip_address: ipValue, observed_at: observedAt });
  }

  // Empty snapshots are valid: old observations naturally expire after 75s.
  const admin = getSupabaseAdmin();
  if (rows.length) {
    const { error } = await admin.from("hotspot_staff_seen_hosts_v42")
      .upsert(rows, { onConflict: "router_id,mac_address,ip_address" });
    if (error) return NextResponse.json({ error: "No se registró presencia Staff." },
      { status: 503, headers });
  }
  return NextResponse.json({ ok: true, seen: rows.length }, { headers });
}
