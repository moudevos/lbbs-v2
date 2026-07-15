import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/supabase/route-auth";

export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const supabase = await createClient();
  const { data, error } = await supabase.from("employees").select("id,full_name").eq("status", "active").order("full_name");
  if (error) {
    console.error("[payment-simulations/get] Error al listar empleados", { message: error.message, code: error.code });
    return NextResponse.json({ error: "No se pudieron cargar los empleados." }, { status: 500 });
  }
  return NextResponse.json({ data: data ?? [] });
}
