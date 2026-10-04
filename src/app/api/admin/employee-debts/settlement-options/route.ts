import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/supabase/route-auth";
import { createClient } from "@/lib/supabase/server";

type DebtOption = { debt_id: string; [key: string]: unknown };
type DebtSource = { debt_id: string; [key: string]: unknown };

export async function GET(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const params = new URL(request.url).searchParams;
  const employeeId = params.get("employeeId")?.trim();
  const branchId = params.get("branchId")?.trim();
  if (!employeeId || !branchId) {
    return NextResponse.json({ error: "Empleado y sede son obligatorios." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_employee_settlement_debt_options_v188", {
    p_employee_id: employeeId,
    p_branch_id: branchId,
  });
  if (error) {
    console.error("[settlement-debt-options/get] Error", { code: error.code, message: error.message });
    return NextResponse.json({ error: "No se pudieron cargar las deudas disponibles." }, { status: 500 });
  }
  const debtIds = ((data ?? []) as DebtOption[]).map((item) => item.debt_id);
  const { data: sources, error: sourcesError } = debtIds.length
    ? await supabase
        .from("vw_employee_debt_source_detail")
        .select("debt_id,debt_type,debt_description,sale_id,sale_reference,first_item_description,extra_item_count,source_description")
        .in("debt_id", debtIds)
    : { data: [], error: null };
  if (sourcesError) {
    console.error("[settlement-debt-options/source] Error", { code: sourcesError.code, message: sourcesError.message });
    return NextResponse.json({ error: "No se pudo cargar el detalle de las deudas disponibles." }, { status: 500 });
  }
  const sourceByDebt = new Map(((sources ?? []) as DebtSource[]).map((source) => [source.debt_id, source]));
  return NextResponse.json({
    data: ((data ?? []) as DebtOption[]).map((debt) => ({ ...debt, source: sourceByDebt.get(debt.debt_id) ?? null })),
  });
}
