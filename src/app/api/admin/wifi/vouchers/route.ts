import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/supabase/route-auth";
import { createClient } from "@/lib/supabase/server";
import { randomInt } from "node:crypto";
import { encryptVoucherCode } from "@/lib/hotspot/voucher-crypto";
import { hashCode } from "@/lib/hotspot/captive";

export async function GET(request: Request) {
  const auth = await requireAdminSession(); if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const branchId = new URL(request.url).searchParams.get("branchId");
  if (branchId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(branchId)) return NextResponse.json({ error: "Sede inválida." }, { status: 400 });
  const supabase = await createClient(); let query = supabase.from("wifi_access_vouchers").select("id,branch_id,code_last4,status,created_at,unused_expires_at,first_used_at,session_expires_at,revoked_at").order("created_at", { ascending: false }).limit(100);
  if (branchId) query = query.eq("branch_id", branchId);
  const { data, error } = await query; if (error) return NextResponse.json({ error: "No se pudieron cargar accesos WiFi." }, { status: 500 });
  const router = branchId ? await supabase.from("hotspot_routers").select("id,name,last_seen_at,status,is_active").eq("branch_id", branchId).maybeSingle() : { data: null };
  return NextResponse.json({ data: data ?? [], router: router.data ?? null });
}
export async function POST(request: Request) {
  const auth = await requireAdminSession(); if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const body = await request.json().catch(() => null); if (!body?.branchId) return NextResponse.json({ error: "Selecciona una sede." }, { status: 400 }); if (typeof body.branchId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.branchId)) return NextResponse.json({ error: "Sede inválida." }, { status: 400 });
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const supabase = await createClient(); const { data, error } = await supabase.rpc("generate_wifi_access_voucher", { p_branch_id: body.branchId, p_code_hash: hashCode(code), p_code_last4: code.slice(-4), p_code_ciphertext: encryptVoucherCode(code) });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data: { ...(Array.isArray(data) ? data[0] : data), code } });
}
