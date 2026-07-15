import { NextResponse } from "next/server";

import {
  appendReservationNote,
  formatSaleReference,
  mapPosErrorMessage,
  toMoneyNumber,
  trimOrNull,
} from "@/app/api/admin/pos/route-helpers";
import { createClient } from "@/lib/supabase/server";
import { requirePosWriteSession } from "@/lib/supabase/route-auth";

type SaleRow = {
  id: string;
  reservation_id: string | null;
  total: number | string;
  status: "draft" | "completed" | "cancelled";
  cancelled_reason: string | null;
  cancelled_at: string | null;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ saleId: string }> },
) {
  const auth = await requirePosWriteSession();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const supabase = await createClient();
  const payload = await request.json().catch(() => null);
  const reasonId = trimOrNull(payload?.reasonId);
  const notes = trimOrNull(payload?.notes);
  const { saleId } = await context.params;

  if (!reasonId) {
    return NextResponse.json(
      { error: "Debes indicar el motivo de anulacion." },
      { status: 400 },
    );
  }

  const { data: cancellationReason, error: reasonError } = await supabase
    .from("sale_cancellation_reasons")
    .select("id,code,name")
    .eq("id", reasonId)
    .eq("is_active", true)
    .maybeSingle();
  if (reasonError || !cancellationReason) {
    console.error("[pos/anulacion] Error al validar motivo", { message: reasonError?.message, code: reasonError?.code, details: reasonError?.details, hint: reasonError?.hint, entityId: saleId });
    return NextResponse.json({ error: "Selecciona un motivo de anulacion valido." }, { status: 400 });
  }
  if (cancellationReason.code === "otro" && !notes) {
    return NextResponse.json({ error: "Describe el otro motivo de anulacion." }, { status: 400 });
  }
  const reason = notes ? `${cancellationReason.name}: ${notes}` : cancellationReason.name;

  const { data: employeeId, error: employeeError } = await supabase.rpc("current_employee_id");

  if (employeeError) {
    console.error("[pos/anulacion] No se pudo leer el empleado actual", {
      message: employeeError.message,
      code: employeeError.code,
    });
    return NextResponse.json(
      { error: "No se pudo validar el empleado actual." },
      { status: 500 },
    );
  }

  const { data: currentSale, error: saleReadError } = await supabase
    .from("sales")
    .select("id, reservation_id, total, status, cancelled_reason, cancelled_at")
    .eq("id", saleId)
    .maybeSingle();

  if (saleReadError) {
    console.error("[pos/anulacion] No se pudo validar la venta", {
      saleId,
      message: saleReadError.message,
      code: saleReadError.code,
    });
    return NextResponse.json(
      { error: "No se pudo validar la venta a anular." },
      { status: 500 },
    );
  }

  if (!currentSale) {
    return NextResponse.json(
      { error: "La venta ya no esta disponible." },
      { status: 404 },
    );
  }

  try {
    const { data: cancelledSale, error: cancelError } = await supabase.rpc(
      "cancel_completed_sale",
      {
        p_sale_id: saleId,
        p_reason: reason,
      },
    );

    if (cancelError || !cancelledSale) {
      throw new Error(cancelError?.message ?? "No se pudo anular la venta.");
    }

    const { error: metadataError } = await supabase.from("sales").update({ cancellation_reason_id: cancellationReason.id, cancellation_notes: notes }).eq("id", saleId);
    if (metadataError) {
      console.error("[pos/anulacion] Error al guardar detalle", { message: metadataError.message, code: metadataError.code, details: metadataError.details, hint: metadataError.hint, entityId: saleId });
    }

    await appendReservationNote(
      supabase,
      currentSale.reservation_id,
      employeeId ?? null,
      `Venta ${formatSaleReference(saleId)} anulada desde POS. Motivo: ${reason}`,
    );

    const sale = cancelledSale as SaleRow;
    return NextResponse.json({
      data: {
        id: sale.id,
        saleReference: formatSaleReference(sale.id),
        status: sale.status,
        total: toMoneyNumber(sale.total),
        cancelledReason: sale.cancelled_reason,
        cancelledAt: sale.cancelled_at,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    console.error("[pos/anulacion] Error", { message, code: null, details: null, hint: null, entityId: saleId });
    return NextResponse.json(
      { error: mapPosErrorMessage(message) },
      { status: 400 },
    );
  }
}
