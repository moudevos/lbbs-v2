import { NextResponse } from "next/server";

import { authenticateRouter } from "@/lib/hotspot/router-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function shortText(value: unknown, max = 255) {
  return typeof value === "string" ? value.trim().slice(0, max) || null : null;
}

export async function POST(request: Request) {
  const authenticated = await authenticateRouter(request);
  if (!authenticated.ok) {
    return NextResponse.json(
      { error: authenticated.status === 401 ? "Router no autorizado." : "Router deshabilitado." },
      { status: authenticated.status },
    );
  }
  const body = await request.json().catch(() => ({}));
  const { error } = await getSupabaseAdmin()
    .from("hotspot_routers")
    .update({
      last_seen_at: new Date().toISOString(),
      routeros_version: shortText(body?.routerosVersion),
      model: shortText(body?.model),
    })
    .eq("id", authenticated.router.id);
  if (error) return NextResponse.json({ error: "No se pudo registrar heartbeat." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
