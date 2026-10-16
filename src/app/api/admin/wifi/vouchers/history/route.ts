import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/supabase/route-auth";
import { createClient } from "@/lib/supabase/server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 30;

export async function GET(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const params = new URL(request.url).searchParams;
  const branchId = params.get("branchId");
  const page = Number(params.get("page") ?? "1");
  const term = (params.get("q") ?? "").trim();
  const dateFrom = params.get("from") ?? "";
  const dateTo = params.get("to") ?? "";
  const mode = params.get("mode") ?? "archived";

  if (!uuid.test(branchId ?? "") || !Number.isSafeInteger(page) || page < 1 || page > 1000 ||
      term.length > 80 || !["archived", "all"].includes(mode) ||
      (dateFrom && !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) ||
      (dateTo && !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) ||
      (dateFrom && dateTo && dateFrom > dateTo)) {
    return NextResponse.json({ error: "Filtros de historial inválidos." }, { status: 400 });
  }

  const supabase = await createClient();
  let query = supabase.from("wifi_access_vouchers")
    .select("id,branch_id,code_last4,status,created_at,unused_expires_at,first_used_at,session_expires_at,device_mac,device_ip,customer_id,archived_at", { count: "exact" })
    .eq("branch_id", branchId)
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (mode === "archived") query = query.not("archived_at", "is", null);
  if (dateFrom) query = query.gte("created_at", dateFrom + "T00:00:00");
  if (dateTo) {
    const dayAfter = new Date(dateTo + "T00:00:00Z");
    dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
    query = query.lt("created_at", dayAfter.toISOString());
  }

  // Keep search safe: limited code suffix, MAC, and IP are the permitted searchable fields.
  if (term) {
    const safe = term.replace(/[^a-zA-Z0-9:.\-]/g, "");
    if (!safe || safe !== term) return NextResponse.json({ error: "Búsqueda inválida." }, { status: 400 });
    query = query.or(`code_last4.ilike.%${safe}%,device_mac.ilike.%${safe}%`);
  }

  const { data, error, count } = await query;
  if (error) {
    console.error("[wifi/history] No se pudo consultar historial", { code: error.code });
    return NextResponse.json({ error: "No se pudo consultar el historial." }, { status: 500 });
  }

  const ids = Array.from(new Set((data ?? []).map((row) => row.customer_id).filter((id): id is string => typeof id === "string")));
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: customers } = await supabase.from("customers").select("id,full_name").in("id", ids);
    for (const customer of customers ?? []) if (customer.full_name) names.set(customer.id, customer.full_name);
  }

  return NextResponse.json({
    data: (data ?? []).map((row) => ({
      ...row,
      customer_name: row.customer_id ? names.get(row.customer_id) ?? null : null,
    })),
    page,
    pageSize: PAGE_SIZE,
    total: count ?? 0,
  });
}
