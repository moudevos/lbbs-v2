import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { resolveOperationalBranchScope } from "@/lib/operational/branch-scope";

function relation<T>(value: T | T[] | null) { return Array.isArray(value) ? value[0] ?? null : value; }

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return NextResponse.json({ error: "Sesion no iniciada." }, { status: 401 });
  const [{ data: role }, { data: employee }] = await Promise.all([supabase.rpc("current_user_role"), supabase.from("employees").select("id,branch_id").eq("user_id", user.user.id).maybeSingle()]);
  if (role !== "owner" && role !== "admin" && role !== "reception") return NextResponse.json({ error: "No tienes permiso para acceder a contactos." }, { status: 403 });
  const requestedBranchId = new URL(request.url).searchParams.get("branchId")?.trim() || null;
  const scope = resolveOperationalBranchScope(role, employee, requestedBranchId);
  const today = new Date().toISOString().slice(0, 10);
  let reservationsQuery = supabase.from("reservations").select("id,customer_id,branch_id,scheduled_date,scheduled_time,status,customer:customers(full_name,phone),branch:branches(name,address),barber:employees!reservations_preferred_barber_id_fkey(full_name),service:services(name)").eq("scheduled_date", today).in("status", ["pending", "contacted", "confirmed", "rescheduled"]);
  let salesQuery = supabase.from("sales").select("id,customer_id,branch_id,barber_id,closed_at,customer:customers(full_name,phone),branch:branches(name),barber:employees!sales_barber_id_fkey(full_name)").eq("status", "completed").gte("closed_at", `${today}T00:00:00`).lte("closed_at", `${today}T23:59:59.999`);
  if (scope.branchId) { reservationsQuery = reservationsQuery.eq("branch_id", scope.branchId); salesQuery = salesQuery.eq("branch_id", scope.branchId); }
  const [reservationsResult, salesResult, templatesResult] = await Promise.all([reservationsQuery, salesQuery, supabase.from("whatsapp_templates").select("id,contact_type,body").eq("is_active", true)]);
  const error = reservationsResult.error ?? salesResult.error ?? templatesResult.error;
  if (error) { console.error("[contacts/get] Error al cargar contactos", { message: error.message, code: error.code, details: error.details, hint: error.hint }); return NextResponse.json({ error: "No se pudieron cargar los contactos." }, { status: 500 }); }
  const saleIds = (salesResult.data ?? []).map((sale) => sale.id);
  const { data: items, error: itemsError } = saleIds.length ? await supabase.from("sale_items").select("sale_id,description_snapshot").in("sale_id", saleIds) : { data: [], error: null };
  if (itemsError) { console.error("[contacts/get] Error al cargar servicios", { message: itemsError.message, code: itemsError.code, details: itemsError.details, hint: itemsError.hint }); return NextResponse.json({ error: "No se pudieron cargar los servicios atendidos." }, { status: 500 }); }
  return NextResponse.json({
    reminders: (reservationsResult.data ?? []).map((row) => ({ id: row.id, customerId: row.customer_id, branchId: row.branch_id, customerName: relation(row.customer)?.full_name ?? "Cliente", phone: relation(row.customer)?.phone ?? "", branchName: relation(row.branch)?.name ?? "Sede", address: relation(row.branch)?.address ?? "", time: row.scheduled_time?.slice(0, 5) ?? "", status: row.status, barberName: relation(row.barber)?.full_name ?? "Cualquier barbero disponible", serviceName: relation(row.service)?.name ?? "No especificado" })),
    thanks: (salesResult.data ?? []).map((row) => ({ id: row.id, customerId: row.customer_id, branchId: row.branch_id, customerName: relation(row.customer)?.full_name ?? "Cliente", phone: relation(row.customer)?.phone ?? "", branchName: relation(row.branch)?.name ?? "Sede", barberName: relation(row.barber)?.full_name ?? "Sin registro", closedAt: row.closed_at, services: (items ?? []).filter((item) => item.sale_id === row.id).map((item) => item.description_snapshot) })),
    templates: templatesResult.data ?? [],
    today,
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: employeeId } = await supabase.rpc("current_employee_id");
  const payload = await request.json().catch(() => null);
  if (!payload?.customerId || !payload?.branchId || !payload?.contactType || !payload?.phone || !payload?.message) return NextResponse.json({ error: "Faltan datos para registrar el contacto." }, { status: 400 });
  const { error } = await supabase.from("whatsapp_contact_logs").insert({ customer_id: payload.customerId, reservation_id: payload.reservationId ?? null, sale_id: payload.saleId ?? null, branch_id: payload.branchId, contact_type: payload.contactType, template_id: payload.templateId ?? null, phone: payload.phone, message_snapshot: payload.message, status: payload.status === "marked_sent" ? "marked_sent" : "opened", contacted_at: new Date().toISOString(), contacted_by: employeeId ?? null });
  if (error) { console.error("[contacts/post] Error al registrar contacto", { message: error.message, code: error.code, details: error.details, hint: error.hint }); return NextResponse.json({ error: "No se pudo registrar el contacto." }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
