import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  hashCode,
  normalizeCode,
  normalizeCaptiveDocument,
  publicError,
  signHotspotToken,
} from "@/lib/hotspot/captive";
import { captiveJson, captiveOptions } from "@/lib/hotspot/cors";

const NextResponse = { json: captiveJson };
export function OPTIONS() {
  return captiveOptions();
}

const candidateStatuses = [
  "available",
  "registration_pending",
  "activation_pending",
  "activation_ready",
] as const;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  // Keep DNI-only legacy portal compatible while the new local HTML is deployed.
  const document = normalizeCaptiveDocument(body?.documentType ?? "DNI", body?.documentNumber ?? body?.dni);
  const code = normalizeCode(body?.code);
  const mac = typeof body?.mac === "string" ? body.mac.trim().toUpperCase() : "";

  if (!document) return NextResponse.json({ error: "Selecciona DNI o CE e ingresa un documento válido." }, { status: 400 });
  if (!code || !/^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac) ||
      typeof body?.routerIdentifier !== "string") {
    return NextResponse.json({ error: publicError }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: router } = await admin
    .from("hotspot_routers")
    .select("id,branch_id")
    .eq("identifier", body.routerIdentifier)
    .eq("is_active", true)
    .maybeSingle();

  const { data: voucher } = router
    ? await admin
        .from("wifi_access_vouchers")
        .select("id,branch_id,router_id,customer_id,status,unused_expires_at,first_used_at,device_mac,revocation_requested_at")
        .eq("code_hash", hashCode(code))
        .maybeSingle()
    : { data: null };

  if (!router || !voucher ||
      voucher.router_id !== router.id ||
      voucher.branch_id !== router.branch_id ||
      !candidateStatuses.includes(voucher.status as typeof candidateStatuses[number]) ||
      voucher.first_used_at !== null ||
      voucher.revocation_requested_at !== null ||
      new Date(voucher.unused_expires_at) <= new Date() ||
      (voucher.device_mac && voucher.device_mac.toUpperCase() !== mac)) {
    return NextResponse.json({ error: publicError }, { status: 400 });
  }

  const { data: customers, error: customerError } = await admin
    .from("customers")
    .select("id,first_name,full_name")
    .eq("document_type", document.type)
    .eq("document_number", document.number)
    .eq("is_active", true);

  if (customerError) {
    return NextResponse.json({ error: "No pudimos comprobar tus datos. Inténtalo nuevamente." }, { status: 503 });
  }
  if ((customers ?? []).length > 1) {
    return NextResponse.json({ error: "Necesitamos validar tus datos en recepción antes de conectarte." }, { status: 409 });
  }

  const base = {
    voucherId: voucher.id,
    routerId: router.id,
    branchId: router.branch_id,
    documentType: document.type,
    documentNumber: document.number,
    mac,
    ip: typeof body.ip === "string" ? body.ip : null,
    exp: Date.now() + 5 * 60_000,
  };

  const customer = customers?.[0] ?? null;
  const alreadyPrepared = voucher.status === "activation_pending" || voucher.status === "activation_ready";

  if (alreadyPrepared) {
    // Idempotent retry of an interrupted RouterOS HTTP-CHAP login only.
    // An active / expired / revoked voucher can NEVER be reused here.
    if (!customer || !voucher.customer_id ||
        voucher.customer_id !== customer.id ||
        !voucher.device_mac ||
        voucher.device_mac.toUpperCase() !== mac) {
      return NextResponse.json({ error: publicError }, { status: 400 });
    }
    return NextResponse.json({
      status: "customer_found",
      firstName: customer.first_name || customer.full_name.split(" ")[0],
      claimToken: signHotspotToken(base),
    });
  }

  if (!customer) {
    return NextResponse.json({
      status: "registration_required",
      registrationToken: signHotspotToken(base),
    });
  }

  const { error: activationError } = await admin.rpc("queue_hotspot_voucher_activation", {
    p_voucher_id: voucher.id,
    p_router_id: router.id,
    p_branch_id: router.branch_id,
    p_customer_id: customer.id,
    p_mac: mac,
    p_ip: base.ip,
  });

  if (activationError) {
    return NextResponse.json({
      error: "No pudimos preparar tu conexión. Inténtalo nuevamente.",
    }, { status: 500 });
  }

  return NextResponse.json({
    status: "customer_found",
    firstName: customer.first_name || customer.full_name.split(" ")[0],
    claimToken: signHotspotToken(base),
  });
}
