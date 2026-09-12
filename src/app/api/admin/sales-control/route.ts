import { NextResponse } from "next/server";

import { trimOrNull } from "@/app/api/admin/pos/route-helpers";
import { createClient } from "@/lib/supabase/server";
import { requirePosWriteSession } from "@/lib/supabase/route-auth";

function limaDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export async function GET(request: Request) {
  const auth = await requirePosWriteSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const params = new URL(request.url).searchParams;
  const accountingDate = trimOrNull(params.get("date")) ?? limaDate();
  const requestedBranchId = trimOrNull(params.get("branchId"));
  const posSessionId = trimOrNull(params.get("posSessionId"));
  const supabase = await createClient();

  try {
    const adminBranch = auth.role === "admin"
      ? await supabase.from("employees").select("branch_id").eq("user_id", auth.userId).maybeSingle()
      : { data: null, error: null };
    if (adminBranch.error) throw new Error(adminBranch.error.message);
    const branchId = adminBranch.data?.branch_id ?? requestedBranchId;

    let branchesQuery = supabase.from("branches").select("id,name").eq("is_active", true).order("name");
    let sessionsQuery = supabase.from("pos_sessions").select("id,branch_id,status,opened_at,branch:branches(name)").eq("business_date", accountingDate).order("opened_at", { ascending: false });
    if (branchId) { branchesQuery = branchesQuery.eq("id", branchId); sessionsQuery = sessionsQuery.eq("branch_id", branchId); }

    const [branches, sessions, breakdown] = await Promise.all([
      branchesQuery,
      sessionsQuery,
      supabase.rpc("get_sales_control_breakdown", { p_accounting_date: accountingDate, p_branch_id: branchId, p_pos_session_id: posSessionId }),
    ]);
    if (branches.error || sessions.error || breakdown.error) {
      throw new Error(branches.error?.message || sessions.error?.message || breakdown.error?.message || "No se pudo cargar el control de ventas.");
    }
    return NextResponse.json({
      date: accountingDate,
      branchId: branchId ?? "",
      branches: branches.data ?? [],
      sessions: sessions.data ?? [],
      data: breakdown.data ?? {},
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    console.error("[sales-control/get] Error", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
