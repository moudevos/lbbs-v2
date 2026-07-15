import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { id } = await params;
  const payload = await request.json().catch(() => null);
  const note = typeof payload?.note === "string" ? payload.note.trim() : "";

  if (!note) {
    return NextResponse.json(
      { error: "Debes escribir una nota de coordinacion." },
      { status: 400 },
    );
  }

  const { data: employeeId, error: employeeError } = await supabase.rpc("current_employee_id");

  if (employeeError) {
    console.error("[reservations/notes] No se pudo leer el empleado actual", {
      message: employeeError.message,
      code: employeeError.code,
      reservationId: id,
    });
    return NextResponse.json(
      { error: "No se pudo validar la sesion de trabajo." },
      { status: 500 },
    );
  }

  const { data, error } = await supabase
    .from("reservation_notes")
    .insert({
      reservation_id: id,
      employee_id: employeeId ?? null,
      note,
    })
    .select("id, reservation_id, employee_id, note, created_at, employee:employees(id, full_name)")
    .single();

  if (error) {
    console.error("[reservations/notes] Error al registrar nota", {
      message: error.message,
      code: error.code,
      reservationId: id,
    });
    return NextResponse.json(
      { error: error.message || "No se pudo registrar la nota." },
      { status: 400 },
    );
  }

  const employee = Array.isArray(data.employee) ? data.employee[0] ?? null : data.employee ?? null;

  return NextResponse.json({
    data: {
      id: data.id,
      reservation_id: data.reservation_id,
      employee_id: data.employee_id,
      employee_name: employee?.full_name ?? null,
      note: data.note,
      created_at: data.created_at,
    },
  });
}
