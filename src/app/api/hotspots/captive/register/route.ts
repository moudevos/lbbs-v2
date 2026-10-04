import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { readHotspotToken, signHotspotToken } from "@/lib/hotspot/captive";
import { normalizePhone } from "@/lib/utils/phone";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null); const token = readHotspotToken(body?.registrationToken);
  const firstName = typeof body?.firstName === "string" ? body.firstName.trim() : ""; const lastName = typeof body?.lastName === "string" ? body.lastName.trim() : ""; const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
  if (!token || !firstName || !lastName || !phone || body?.privacyAccepted !== true) return NextResponse.json({ error: "Completa los datos obligatorios y acepta el registro." }, { status: 400 });
  const dni = String(token.dni); const admin = getSupabaseAdmin();
  const { data: voucher } = await admin.from("wifi_access_vouchers").select("id,status,router_id,branch_id,device_mac").eq("id",String(token.voucherId)).maybeSingle();
  if (!voucher || voucher.router_id !== token.routerId || voucher.branch_id !== token.branchId || (voucher.device_mac && voucher.device_mac !== token.mac) || !["available","registration_pending"].includes(voucher.status)) return NextResponse.json({ error: "No pudimos completar el acceso. Inténtalo nuevamente." }, { status: 400 });
  const { data: matches } = await admin.from("customers").select("id,first_name,full_name").eq("document_type","DNI").eq("document_number",dni).eq("is_active",true);
  if ((matches ?? []).length > 1) return NextResponse.json({ error: "Necesitamos validar tus datos en recepción antes de conectarte." }, { status: 409 });
  let customer = matches?.[0] ?? null;
  if (!customer) {
    const phoneNormalized = normalizePhone(phone); if (phoneNormalized.length < 7) return NextResponse.json({ error: "Ingresa un celular válido." }, { status: 400 });
    const { data, error } = await admin.from("customers").insert({ first_name: firstName, last_name: lastName, full_name: `${firstName} ${lastName}`, phone, phone_normalized: phoneNormalized, email: typeof body?.email === "string" && body.email.trim() ? body.email.trim().toLowerCase() : null, document_type: "DNI", document_number: dni, preferred_branch_id: voucher.branch_id, source: "hotspot", is_active: true }).select("id,first_name,full_name").single();
    if (error) return NextResponse.json({ error: "Necesitamos validar tus datos en recepción antes de conectarte." }, { status: 409 }); customer = data;
  }
  await admin.from("wifi_access_vouchers").update({ customer_id: customer.id, device_mac: String(token.mac), device_ip: token.ip ?? null, claimed_at: new Date().toISOString(), status: "activation_pending" }).eq("id", voucher.id);
  await admin.from("hotspot_router_commands").upsert({ router_id: voucher.router_id, voucher_id: voucher.id, command_type: "ACTIVATE_VOUCHER", payload: { mac: token.mac }, idempotency_key: `activate:${voucher.id}` }, { onConflict: "idempotency_key" });
  return NextResponse.json({ status: "customer_created", firstName: customer.first_name || firstName, claimToken: signHotspotToken({ ...token, exp: Date.now() + 5 * 60_000 }) });
}
