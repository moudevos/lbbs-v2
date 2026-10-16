import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";

import { hashCode } from "@/lib/hotspot/captive";
import { isRouterOnline } from "@/lib/hotspot/router-auth";
import { encryptVoucherCode } from "@/lib/hotspot/voucher-crypto";
import { requireAdminSession } from "@/lib/supabase/route-auth";
import { createClient } from "@/lib/supabase/server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CODE_ATTEMPTS = 8;

export async function GET(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const branchId = new URL(request.url).searchParams.get("branchId");
  if (branchId && !uuid.test(branchId)) {
    return NextResponse.json({ error: "Sede inválida." }, { status: 400 });
  }

  const supabase = await createClient();
  let query = supabase
    .from("wifi_access_vouchers")
    .select("id,branch_id,code_last4,status,created_at,unused_expires_at,first_used_at,session_expires_at,revoked_at,claimed_at,device_mac,device_ip,customer_id,revocation_requested_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (branchId) query = query.eq("branch_id", branchId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "No se pudieron cargar accesos WiFi." }, { status: 500 });
  }

  // Enrich only the already-authorized voucher rows with accessible customer names.
  // The dashboard keeps working when customer visibility is restricted by RLS.
  const customerIds = Array.from(
    new Set((data ?? []).map((row) => row.customer_id).filter((id): id is string => typeof id === "string")),
  );
  const customerNames = new Map<string, string>();
  if (customerIds.length > 0) {
    const { data: customers, error: customersError } = await supabase
      .from("customers")
      .select("id,full_name")
      .in("id", customerIds);
    if (!customersError) {
      for (const customer of customers ?? []) {
        if (customer.full_name) customerNames.set(customer.id, customer.full_name);
      }
    }
  }
  const pendingRevocations = (data ?? []).filter((row) => row.revocation_requested_at && row.status !== "revoked").map((row) => row.id);
  const { data: revocationCommands, error: revocationError } = pendingRevocations.length
    ? await supabase
        .from("hotspot_router_commands")
        .select("voucher_id,status,error_message")
        .eq("command_type", "REVOKE_VOUCHER")
        .in("voucher_id", pendingRevocations)
    : { data: [], error: null };
  if (revocationError) {
    console.error("[wifi/vouchers] No se pudo consultar estado de revocaciones", { code: revocationError.code });
    return NextResponse.json({ error: "No se pudieron cargar estados de revocación." }, { status: 500 });
  }
  const revocationMap = new Map((revocationCommands ?? []).map((cmd) => [cmd.voucher_id, cmd]));

  const vouchers = (data ?? []).map((row) => ({
    ...row,
    customer_name: row.customer_id ? customerNames.get(row.customer_id) ?? null : null,
    revoke_command_status: revocationMap.get(row.id)?.status ?? null,
  }));

  let router = null;
  if (branchId) {
    const { data: routerData } = await supabase
      .from("hotspot_routers")
      .select("id,name,identifier,last_seen_at,status,is_active,routeros_version,model,uptime")
      .eq("branch_id", branchId)
      .eq("is_active", true)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    router = routerData ?? null;
  }

  return NextResponse.json({ data: vouchers, router });
}

export async function POST(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const body = await request.json().catch(() => null);
  if (!body?.branchId) {
    return NextResponse.json({ error: "Selecciona una sede." }, { status: 400 });
  }
  if (typeof body.branchId !== "string" || !uuid.test(body.branchId)) {
    return NextResponse.json({ error: "Sede inválida." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: router } = await supabase
    .from("hotspot_routers")
    .select("id,last_seen_at,status,is_active")
    .eq("branch_id", body.branchId)
    .eq("is_active", true)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!router) {
    return NextResponse.json({ error: "Configura el MikroTik de esta sede antes de generar accesos." }, { status: 409 });
  }
  if (!isRouterOnline(router.last_seen_at)) {
    return NextResponse.json({ error: "El MikroTik está fuera de línea. Verifica heartbeat antes de generar un acceso." }, { status: 409 });
  }

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const { data, error } = await supabase.rpc("generate_wifi_access_voucher", {
      p_branch_id: body.branchId,
      p_code_hash: hashCode(code),
      p_code_last4: code.slice(-4),
      p_code_ciphertext: encryptVoucherCode(code),
    });

    if (!error) {
      return NextResponse.json({
        data: {
          ...(Array.isArray(data) ? data[0] : data),
          code,
        },
      });
    }

    if (error.code !== "23505") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  return NextResponse.json(
    { error: "No se pudo reservar un código único. Intenta nuevamente." },
    { status: 409 },
  );
}
