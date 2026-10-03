import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { hashCode, normalizeCode, normalizeDni, publicError, signHotspotToken } from "@/lib/hotspot/captive";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null); const dni = normalizeDni(body?.dni); const code = normalizeCode(body?.code);
  if (!dni) return NextResponse.json({ error: "Ingresa un DNI válido de 8 dígitos." }, { status: 400 });
  if (!code || typeof body?.mac !== "string" || typeof body?.routerIdentifier !== "string") return NextResponse.json({ error: publicError }, { status: 400 });
  const admin = getSupabaseAdmin();
  const { data: router } = await admin.from("hotspot_routers").select("id,branch_id").eq("identifier", body.routerIdentifier).eq("is_active", true).maybeSingle();
  const { data: voucher } = router ? await admin.from("wifi_access_vouchers").select("id,branch_id,router_id,status,unused_expires_at,device_mac").eq("code_hash", hashCode(code)).maybeSingle() : { data: null };
  if (!router || !voucher || voucher.router_id !== router.id || voucher.branch_id !== router.branch_id || !["available","registration_pending"].includes(voucher.status) || new Date(voucher.unused_expires_at) <= new Date() || (voucher.device_mac && voucher.device_mac !== body.mac)) return NextResponse.json({ error: publicError }, { status: 400 });
  const { data: customers } = await admin.from("customers").select("id,first_name,full_name").eq("document_type","DNI").eq("document_number",dni).eq("is_active",true);
  if ((customers ?? []).length > 1) return NextResponse.json({ error: "Necesitamos validar tus datos en recepción antes de conectarte." }, { status: 409 });
  const base = { voucherId: voucher.id, routerId: router.id, branchId: router.branch_id, dni, mac: body.mac, ip: typeof body.ip === "string" ? body.ip : null, exp: Date.now() + 5 * 60_000 };
  if (!customers?.length) return NextResponse.json({ status: "registration_required", registrationToken: signHotspotToken(base) });
  const customer = customers[0];
  await admin.from("wifi_access_vouchers").update({ customer_id: customer.id, device_mac: body.mac, device_ip: base.ip, claimed_at: new Date().toISOString(), status: "activation_pending" }).eq("id", voucher.id);
  await admin.from("hotspot_router_commands").upsert({ router_id: router.id, voucher_id: voucher.id, command_type: "ACTIVATE_VOUCHER", payload: { mac: body.mac }, idempotency_key: `activate:${voucher.id}` }, { onConflict: "idempotency_key" });
  return NextResponse.json({ status: "customer_found", firstName: customer.first_name || customer.full_name.split(" ")[0], claimToken: signHotspotToken(base) });
}
