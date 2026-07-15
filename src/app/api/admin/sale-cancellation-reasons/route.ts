import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePosWriteSession } from "@/lib/supabase/route-auth";

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
