import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requirePosWriteSession } from "@/lib/supabase/route-auth";

function relation<T>(value: T | T[] | null) { return Array.isArray(value) ? value[0] ?? null : value; }

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function matchesSearch(values: Array<string | null | undefined>, search: string) {
  if (!search) return true;
  return values.some((value) => typeof value === "string" && value.toLocaleLowerCase("es-PE").includes(search));
}

export async function GET(request: Request) {
  const auth = await requirePosWriteSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const supabase = await createClient();
  const params = new URL(request.url).searchParams;
  const sessionId = params.get("sessionId")?.trim() ?? "";
  const requestedDate = params.get("date")?.trim() ?? "";
  const search = (params.get("search") ?? "").trim().toLocaleLowerCase("es-PE");
  const statuses = ["scheduled", "pending", "contacted", "confirmed", "rescheduled", "checked_in"];
  if (!sessionId) return NextResponse.json({ error: "Falta la sesion POS." }, { status: 400 });

  const { data: session, error: sessionError } = await supabase.from("pos_sessions").select("id,branch_id,status,business_date").eq("id", sessionId).maybeSingle();
  if (sessionError || !session) {
    console.error("[pos/reservations] Error", { message: sessionError?.message, code: sessionError?.code, details: sessionError?.details, hint: sessionError?.hint, branchId: null, sessionId, requestedDate, statuses });
    return NextResponse.json({ error: "La sesion POS no esta disponible." }, { status: 404 });
  }
  if (session.status !== "open") {
    return NextResponse.json({ error: "La sesion POS debe estar abierta para usar reservas." }, { status: 409 });
  }
  const selectedDate = requestedDate || session.business_date;
  if (!isIsoDate(selectedDate)) {
    return NextResponse.json({ error: "La fecha de reservas no es valida." }, { status: 400 });
  }
  const { data, error } = await supabase.from("reservations").select("id,status,scheduled_date,scheduled_time,customer_id,branch_id,preferred_barber_id,service_interest_id,source,customer:customers(id,full_name,phone,document_number,is_active),barber:employees!reservations_preferred_barber_id_fkey(full_name),service:services(name),sales(id,status)").eq("branch_id", session.branch_id).eq("scheduled_date", selectedDate).in("status", statuses).order("scheduled_time");
  if (error) {
    console.error("[pos/reservations] Error", { message: error.message, code: error.code, details: error.details, hint: error.hint, branchId: session.branch_id, sessionId, selectedDate, statuses });
    return NextResponse.json({ error: "No se pudieron cargar las reservas disponibles." }, { status: 500 });
  }
  const rows = (data ?? []).map((row) => {
    const customer = relation(row.customer);
    const sales = row.sales ?? [];
    const linkedSale = sales.find((sale) => sale.status === "completed")
      ?? sales.find((sale) => sale.status === "draft")
      ?? null;
    return { id: row.id, status: row.status, scheduledDate: row.scheduled_date, time: row.scheduled_time?.slice(0, 5) ?? "", customer: customer ? { id: customer.id, full_name: customer.full_name, phone: customer.phone, document_number: customer.document_number, is_active: customer.is_active } : null, branchId: row.branch_id, barberId: row.preferred_barber_id, barberName: relation(row.barber)?.full_name ?? null, serviceId: row.service_interest_id, serviceName: relation(row.service)?.name ?? null, source: row.source, linkedSale };
  }).filter((row) => row.linkedSale?.status !== "completed")
    .filter((row) => matchesSearch([row.customer?.full_name, row.customer?.phone, row.customer?.document_number], search));
  return NextResponse.json({ data: rows, selectedDate });
}
