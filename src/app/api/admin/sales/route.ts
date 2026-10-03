import { NextResponse } from "next/server";

import { mapPosErrorMessage, toMoneyNumber, trimOrNull } from "@/app/api/admin/pos/route-helpers";
import { createClient } from "@/lib/supabase/server";
import { requirePosWriteSession } from "@/lib/supabase/route-auth";

type OptionRow = { id: string; name?: string | null; full_name?: string | null; opened_at?: string | null; branch?: { name: string | null }[] | { name: string | null } | null };
type CanonicalSaleRow = { sale_id: string; sale_reference: string; created_at: string; closed_at: string | null; status: "draft" | "completed" | "cancelled"; customer_name: string | null; branch_name: string | null; total: number | string; paid_total: number | string; change_amount: number | string; payment_method_labels: string[] | null; pos_session_id: string; has_courtesy: boolean; item_types: Array<"service" | "product"> | null; session_status: "open" | "pending_close" | "closed" | "cancelled" | null; responsibles: Array<{ employee_name?: string | null }> | null };
type CanonicalPage = { rows?: CanonicalSaleRow[]; total_count?: number | string; page?: number; page_size?: number };

function unwrapRelation<T>(value: T[] | T | null | undefined) { return Array.isArray(value) ? value[0] ?? null : value ?? null; }
function formatSessionLabel(sessionId: string) { return `SES-${sessionId.slice(0, 8).toUpperCase()}`; }
function parsePage(value: string | null) { const parsed = Number(value ?? "1"); return Number.isInteger(parsed) && parsed > 0 ? parsed : 1; }

export async function GET(request: Request) {
  const auth = await requirePosWriteSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const dateFrom = trimOrNull(searchParams.get("dateFrom"));
  const dateTo = trimOrNull(searchParams.get("dateTo"));
  const branchId = trimOrNull(searchParams.get("branchId"));
  const status = trimOrNull(searchParams.get("status"));
  const customer = trimOrNull(searchParams.get("customer"));
  const responsibleEmployeeId = trimOrNull(searchParams.get("responsibleEmployeeId")) ?? trimOrNull(searchParams.get("barberId"));
  const paymentMethodId = trimOrNull(searchParams.get("paymentMethodId"));
  const posSessionId = trimOrNull(searchParams.get("posSessionId"));
  const itemType = trimOrNull(searchParams.get("itemType"));
  const courtesy = trimOrNull(searchParams.get("courtesy"));
  const page = parsePage(searchParams.get("page"));

  try {
    const adminBranchResult = auth.role === "admin" ? await supabase.from("employees").select("branch_id").eq("user_id", auth.userId).maybeSingle() : { data: null, error: null };
    if (adminBranchResult.error) throw new Error("No se pudo validar la sede asignada del administrador.");
    const assignedAdminBranchId = adminBranchResult.data?.branch_id ?? null;
    const effectiveBranchId = assignedAdminBranchId ?? branchId;
    let branchesQuery = supabase.from("branches").select("id,name").order("name", { ascending: true });
    let responsiblesQuery = supabase.from("employees").select("id,full_name").eq("status", "active").order("full_name", { ascending: true });
    let sessionsQuery = supabase.from("pos_sessions").select("id,opened_at,branch:branches(name)").order("opened_at", { ascending: false }).limit(60);
    if (assignedAdminBranchId) { branchesQuery = branchesQuery.eq("id", assignedAdminBranchId); responsiblesQuery = responsiblesQuery.eq("branch_id", assignedAdminBranchId); sessionsQuery = sessionsQuery.eq("branch_id", assignedAdminBranchId); }
    const [pageResult, branchesResult, responsiblesResult, paymentMethodsResult, sessionsResult] = await Promise.all([
      supabase.rpc("get_sales_canonical_page", { p_date_from: dateFrom, p_date_to: dateTo, p_branch_id: effectiveBranchId, p_status: status, p_customer: customer, p_responsible_employee_id: responsibleEmployeeId, p_payment_method_id: paymentMethodId, p_pos_session_id: posSessionId, p_item_type: itemType, p_courtesy: courtesy, p_page: page, p_page_size: 50 }),
      branchesQuery, responsiblesQuery,
      supabase.from("payment_methods").select("id,name").eq("is_active", true).order("sort_order", { ascending: true }), sessionsQuery,
    ]);
    if (pageResult.error || branchesResult.error || responsiblesResult.error || paymentMethodsResult.error || sessionsResult.error) throw new Error(pageResult.error?.message || branchesResult.error?.message || responsiblesResult.error?.message || paymentMethodsResult.error?.message || sessionsResult.error?.message || "No se pudo cargar el historial de ventas.");
    const canonical = (pageResult.data ?? {}) as CanonicalPage;
    return NextResponse.json({
      data: (canonical.rows ?? []).map((sale) => ({
        id: sale.sale_id, saleReference: sale.sale_reference || `VTA-${sale.sale_id.slice(0, 8).toUpperCase()}`, createdAt: sale.created_at, closedAt: sale.closed_at, status: sale.status,
        customerName: sale.customer_name ?? "Cliente", branchName: sale.branch_name ?? "Sin sede", barberName: sale.responsibles?.[0]?.employee_name ?? null,
        responsibleNames: (sale.responsibles ?? []).map((responsible) => responsible.employee_name).filter((name): name is string => Boolean(name)), total: toMoneyNumber(sale.total), paidTotal: toMoneyNumber(sale.paid_total), changeAmount: toMoneyNumber(sale.change_amount), paymentMethodLabels: sale.payment_method_labels ?? [], posSessionLabel: formatSessionLabel(sale.pos_session_id), hasCourtesy: sale.has_courtesy, itemTypes: sale.item_types ?? [], canCancel: sale.status === "completed" && sale.session_status === "open",
      })),
      pagination: { totalCount: Number(canonical.total_count ?? 0), page: Number(canonical.page ?? page), pageSize: Number(canonical.page_size ?? 50) },
      filters: {
        branches: ((branchesResult.data ?? []) as OptionRow[]).map((branch) => ({ id: branch.id, label: branch.name ?? "Sede" })),
        barbers: ((responsiblesResult.data ?? []) as OptionRow[]).map((employee) => ({ id: employee.id, label: employee.full_name ?? "Responsable" })),
        paymentMethods: ((paymentMethodsResult.data ?? []) as OptionRow[]).map((method) => ({ id: method.id, label: method.name ?? "Método" })),
        sessions: ((sessionsResult.data ?? []) as OptionRow[]).map((session) => ({ id: session.id, label: `${formatSessionLabel(session.id)} · ${unwrapRelation(session.branch)?.name ?? "Sede"}` })),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    console.error("[sales/get] Error al cargar historial canónico", { message });
    return NextResponse.json({ error: mapPosErrorMessage(message) }, { status: 400 });
  }
}
