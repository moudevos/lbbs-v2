import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  normalizeBirthdate,
  normalizeCaptiveDocument,
  normalizeCaptiveEmail,
  readHotspotToken,
  signHotspotToken,
} from "@/lib/hotspot/captive";
import { captiveJson, captiveOptions } from "@/lib/hotspot/cors";

const NextResponse = { json: captiveJson };
export function OPTIONS() { return captiveOptions(); }

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const token = readHotspotToken(body?.registrationToken);
  const firstName = typeof body?.firstName === "string" ? body.firstName.trim() : "";
  const lastName = typeof body?.lastName === "string" ? body.lastName.trim() : "";
  const email = normalizeCaptiveEmail(body?.email);
  const birthdate = normalizeBirthdate(body?.birthdate);
  const clubMarketingAccepted = body?.clubMarketingAccepted === true;
  if (!token || !firstName || !lastName || body?.privacyAccepted !== true) {
    return NextResponse.json({ error: "Completa los datos obligatorios y acepta los términos para conectarte." }, { status: 400 });
  }
  // Signed token holds the validated document; NEVER trust a document supplied by registration POST.
  // Legacy tokens generated before the DNI/CE rollout still contain only "dni".
  const document = normalizeCaptiveDocument(token.documentType ?? "DNI", token.documentNumber ?? token.dni);
  if (!document) return NextResponse.json({ error: "Documento de identidad inválido." }, { status: 400 });
  if (email === undefined) return NextResponse.json({ error: "Ingresa un correo electrónico válido o déjalo vacío." }, { status: 400 });
  if (birthdate === undefined) return NextResponse.json({ error: "Ingresa una fecha de cumpleaños válida que no sea futura." }, { status: 400 });

  const admin = getSupabaseAdmin();
  const { data: voucher } = await admin.from("wifi_access_vouchers")
    .select("id,status,router_id,branch_id,device_mac,first_used_at,revocation_requested_at,unused_expires_at")
    .eq("id", String(token.voucherId)).maybeSingle();
  if (!voucher || voucher.router_id !== token.routerId || voucher.branch_id !== token.branchId ||
      (voucher.device_mac && voucher.device_mac.toUpperCase() !== String(token.mac).toUpperCase()) ||
      voucher.first_used_at !== null || voucher.revocation_requested_at !== null ||
      new Date(voucher.unused_expires_at) <= new Date() ||
      !["available", "registration_pending"].includes(voucher.status)) {
    return NextResponse.json({ error: "No pudimos completar el acceso. Inténtalo nuevamente." }, { status: 400 });
  }
  const { data: matches, error: matchError } = await admin.from("customers")
    .select("id,first_name,full_name")
    .eq("document_type", document.type)
    .eq("document_number", document.number)
    .eq("is_active", true);
  if (matchError) return NextResponse.json({ error: "No pudimos comprobar tus datos." }, { status: 503 });
  if ((matches ?? []).length > 1) return NextResponse.json({ error: "Necesitamos validar tus datos en recepción antes de conectarte." }, { status: 409 });

  let customer = matches?.[0] ?? null;
  if (!customer) {
    const { data, error } = await admin.from("customers").insert({
      first_name: firstName, last_name: lastName, full_name: firstName + " " + lastName,
      phone: null, phone_normalized: null, email, birthdate,
      document_type: document.type, document_number: document.number,
      preferred_branch_id: voucher.branch_id, source: "hotspot", is_active: true,
    }).select("id,first_name,full_name").single();
    if (error) return NextResponse.json({ error: "Necesitamos validar tus datos en recepción antes de conectarte." }, { status: 409 });
    customer = data;
  }

  const requiredConsents = [
    { customer_id: customer.id, consent_type: "privacy_notice", document_version: "2026-10-06", granted: true, source: "hotspot", metadata: { channel: "captive_portal" } },
    { customer_id: customer.id, consent_type: "wifi_terms", document_version: "2026-10-06", granted: true, source: "hotspot", metadata: { channel: "captive_portal" } },
    { customer_id: customer.id, consent_type: "club_marketing", document_version: "2026-10-06", granted: clubMarketingAccepted, source: "hotspot", metadata: { channel: "captive_portal" } },
  ];
  const { error: consentError } = await admin.from("customer_consents").insert(requiredConsents);
  if (consentError) return NextResponse.json({ error: "No pudimos registrar tus consentimientos. Inténtalo nuevamente." }, { status: 500 });

  const { error: activationError } = await admin.rpc("queue_hotspot_voucher_activation", {
    p_voucher_id: voucher.id, p_router_id: voucher.router_id, p_branch_id: voucher.branch_id,
    p_customer_id: customer.id, p_mac: String(token.mac), p_ip: token.ip ?? null,
  });
  if (activationError) return NextResponse.json({ error: "No pudimos preparar tu conexión. Inténtalo nuevamente." }, { status: 500 });
  return NextResponse.json({
    status: "customer_created", firstName: customer.first_name || firstName,
    claimToken: signHotspotToken({ ...token, exp: Date.now() + 5 * 60_000 }),
  });
}
