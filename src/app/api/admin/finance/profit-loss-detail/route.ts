import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/supabase/route-auth";
import { createClient } from "@/lib/supabase/server";
import { profitLossLines } from "@/features/finance/profit-loss-lines";

const lines = {
  service_revenue: { group: "operating_income", businessLine: "services", sign: 1 },
  barbershop_product_revenue: { group: "operating_income", businessLine: "barbershop_products", sign: 1 },
  cafeteria_product_revenue: { group: "operating_income", businessLine: "cafeteria_products", sign: 1 },
  other_operating_revenue: { group: "operating_income", businessLine: "other", sign: 1 },
  product_cogs: { group: "cost_of_sales", excludeCode: "courtesy_actual_cost", sign: -1 },
  courtesy_real_cost: { group: "cost_of_sales", code: "courtesy_actual_cost", sign: -1 },
  personnel_accrued_cost: { group: "personnel_cost", sign: -1 },
  operating_expenses: { group: "operating_expense", sign: -1 },
} as const;
type Line = keyof typeof lines;
const date = (value: string | null) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export async function GET(request: Request) {
  const auth = await requireAdminSession(); if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const params = new URL(request.url).searchParams; const from = params.get("from"); const to = params.get("to"); const selected = params.get("line") as Line; const branchId = params.get("branchId");
  if (!date(from) || !date(to) || from! > to! || !lines[selected] || (branchId && !uuid(branchId))) return NextResponse.json({ error: "Parámetros de detalle inválidos." }, { status: 400 });
  const definition = lines[selected]; const supabase = await createClient();
  // Aggregate every matching posting server-side so the detail total always
  // reconciles with the canonical RPC; only the first 100 entries are sent.
  let query = supabase.from("vw_financial_postings_signed").select("id,accounting_date,description,amount,profit_signed_amount,posting_code,financial_group,business_line,source_type,source_id", { count: "exact" }).gte("accounting_date", from!).lte("accounting_date", to!).eq("affects_profit", true).eq("financial_group", definition.group).order("accounting_date", { ascending: false }).range(0, 9999);
  if (branchId) query = query.eq("branch_id", branchId);
  if ("businessLine" in definition) query = query.eq("business_line", definition.businessLine);
  if ("code" in definition) query = query.eq("posting_code", definition.code);
  if ("excludeCode" in definition) query = query.neq("posting_code", definition.excludeCode);
  const { data, error, count } = await query; if (error) return NextResponse.json({ error: "No se pudo cargar el detalle financiero." }, { status: 500 });
  const entries = (data ?? []).map((entry) => ({ ...entry, amount: Number(entry.profit_signed_amount ?? 0) * definition.sign }));
  const groups = new Map<string, number>(); for (const entry of entries) groups.set(entry.posting_code, (groups.get(entry.posting_code) ?? 0) + entry.amount);
  return NextResponse.json({ line: selected, label: profitLossLines[selected].label, total: entries.reduce((sum, entry) => sum + entry.amount, 0), totalCount: count ?? 0, groups: [...groups].map(([label, amount]) => ({ label, amount })), entries: entries.slice(0, 100), truncated: entries.length > 100 });
}
