import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/supabase/route-auth";
import { createClient } from "@/lib/supabase/server";

const validDate = (value: string | null) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
export async function GET(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const query = new URL(request.url).searchParams;
  const from = query.get("from"); const to = query.get("to"); const branchId = query.get("branchId") || null;
  if (!validDate(from) || !validDate(to) || from! > to!) return NextResponse.json({ error: "Selecciona un rango de fechas válido." }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_financial_analysis_v2", { p_date_from: from, p_date_to: to, p_branch_id: branchId });
  if (error) { console.error("[finance/analysis-v2] Error", { message: error.message, code: error.code }); return NextResponse.json({ error: "No se pudo calcular el análisis financiero V2." }, { status: 500 }); }
  return NextResponse.json({ data });
}
