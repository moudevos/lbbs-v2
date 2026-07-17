import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireAdminSession, requirePosWriteSession } from "@/lib/supabase/route-auth";

export async function GET() {
  const auth = await requirePosWriteSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const supabase = await createClient();
  const { data, error } = await supabase.from("sale_cancellation_reasons").select("id,code,name,description").eq("is_active", true).order("sort_order");
  if (error) {
    console.error("[sales/cancellation-reasons] Error", { message: error.message, code: error.code, details: error.details, hint: error.hint });
    return NextResponse.json({ error: "No se pudieron cargar los motivos de anulacion." }, { status: 500 });
  }
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const payload = await request.json().catch(() => null);
  const code = typeof payload?.code === "string" ? payload.code.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") : "";
  const name = typeof payload?.name === "string" ? payload.name.trim() : "";
  if (!code || !name) {
    return NextResponse.json({ error: "Codigo y nombre son obligatorios." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("sale_cancellation_reasons")
    .upsert({
      code,
      name,
      description: typeof payload?.description === "string" ? payload.description.trim() || null : null,
      sort_order: Number.isInteger(payload?.sort_order) && payload.sort_order >= 0 ? payload.sort_order : 0,
      is_active: payload?.is_active !== false,
    }, { onConflict: "code" })
    .select("id,code,name,description")
    .single();

  if (error) {
    console.error("[sales/cancellation-reasons] No se pudo guardar el motivo", {
      message: error.message,
      code: error.code,
    });
    return NextResponse.json({ error: "No se pudo guardar el motivo de anulacion." }, { status: 400 });
  }

  return NextResponse.json({ data });
}
