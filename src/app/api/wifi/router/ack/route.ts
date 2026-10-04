import { NextResponse } from "next/server";

import { authenticateRouter, COMMAND_RETRY_LIMIT } from "@/lib/hotspot/router-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function POST(request: Request) {
  const authenticated = await authenticateRouter(request);
  if (!authenticated.ok) {
    return NextResponse.json(
      { error: authenticated.status === 401 ? "Router no autorizado." : "Router deshabilitado." },
      { status: authenticated.status },
    );
  }
  const body = await request.json().catch(() => null);
  if (!uuid.test(body?.commandId ?? "") || typeof body?.success !== "boolean") {
    return NextResponse.json({ error: "ACK inválido." }, { status: 400 });
  }
  const rawResult = jsonValue(body.result);
  // Router results are not a place to retain credentials. The only durable
  // CREATE result currently needed is the RouterOS user identifier.
  const routerUserId = typeof rawResult?.routerUserId === "string" ? rawResult.routerUserId.slice(0, 255) : null;
  const result = routerUserId ? { routerUserId } : null;
  const { data, error } = await getSupabaseAdmin().rpc("ack_hotspot_router_command", {
    p_router_id: authenticated.router.id,
    p_command_id: body.commandId,
    p_success: body.success,
    p_result: result,
    p_error_code: typeof body.errorCode === "string" ? body.errorCode : null,
    p_error_message: typeof body.errorMessage === "string" ? body.errorMessage : null,
    p_router_user_id: routerUserId,
    p_retry_limit: COMMAND_RETRY_LIMIT,
  });
  if (error) {
    console.error("[hotspot/router/ack] No se pudo confirmar comando", { code: error.code });
    return NextResponse.json({ error: "No se pudo confirmar el comando." }, { status: 500 });
  }
  const outcome = Array.isArray(data) ? data[0]?.outcome : null;
  if (!outcome || outcome === "not_found") {
    return NextResponse.json({ error: "Comando no encontrado." }, { status: 404 });
  }
  if (outcome === "not_processing") {
    return NextResponse.json({ error: "El comando no está en proceso." }, { status: 409 });
  }
  return NextResponse.json({ status: outcome });
}
