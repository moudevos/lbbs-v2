import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import { hashRouterToken } from "@/lib/hotspot/router-auth";
import { requireAdminSession } from "@/lib/supabase/route-auth";
import { createClient } from "@/lib/supabase/server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const identifier = /^[a-z0-9][a-z0-9-]{2,62}$/;
const issueToken = () => `lbbs_rt_${randomBytes(24).toString("base64url")}`;

export async function GET(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const branchId = new URL(request.url).searchParams.get("branchId");
  const db = await createClient();
  let query = db
    .from("hotspot_routers")
    .select("id,branch_id,name,identifier,status,is_active,last_seen_at,routeros_version,model,uptime,created_at")
    .order("created_at", { ascending: false });

  if (branchId) {
    if (!uuid.test(branchId)) {
      return NextResponse.json({ error: "Sede inválida." }, { status: 400 });
    }
    query = query.eq("branch_id", branchId);
  }

  const { data, error } = await query;
  return error
    ? NextResponse.json({ error: "No se pudieron cargar routers." }, { status: 500 })
    : NextResponse.json({ data });
}

export async function POST(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const branchId = body?.branchId;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const id = typeof body?.identifier === "string" ? body.identifier.trim().toLowerCase() : "";

  if (!uuid.test(branchId ?? "") || !name || !identifier.test(id)) {
    return NextResponse.json({ error: "Datos de router inválidos." }, { status: 400 });
  }

  const db = await createClient();
  const { data: existing } = await db
    .from("hotspot_routers")
    .select("id")
    .eq("branch_id", branchId)
    .eq("is_active", true)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "Esta sede ya tiene un MikroTik activo. Regenera su token si necesitas reconfigurarlo." },
      { status: 409 },
    );
  }

  const token = issueToken();
  const { data, error } = await db
    .from("hotspot_routers")
    .insert({
      branch_id: branchId,
      name: name.slice(0, 120),
      identifier: id,
      token_hash: hashRouterToken(token),
      status: "active",
      is_active: true,
    })
    .select("id,branch_id,name,identifier,status,is_active")
    .single();

  if (error) {
    return NextResponse.json({ error: "No se pudo registrar el router." }, { status: 400 });
  }

  return NextResponse.json({ data, token }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const body = await request.json().catch(() => null);
  if (!uuid.test(body?.routerId ?? "")) {
    return NextResponse.json({ error: "Router inválido." }, { status: 400 });
  }

  const db = await createClient();
  const token = issueToken();
  const { data, error } = await db
    .from("hotspot_routers")
    .update({ token_hash: hashRouterToken(token), updated_at: new Date().toISOString() })
    .eq("id", body.routerId)
    .eq("is_active", true)
    .eq("status", "active")
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "No se pudo regenerar el token." }, { status: 400 });
  }

  return NextResponse.json({ token });
}
