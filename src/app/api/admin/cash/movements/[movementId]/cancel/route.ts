import { NextResponse } from "next/server";

import {
  mapCashErrorMessage,
  trimOrNull,
} from "@/app/api/admin/cash/route-helpers";
import { createClient } from "@/lib/supabase/server";
import { requireCashWriteSession } from "@/lib/supabase/route-auth";

export async function POST(
  request: Request,
  context: { params: Promise<{ movementId: string }> },
) {
  const auth = await requireCashWriteSession();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const supabase = await createClient();
  const { movementId } = await context.params;
  const payload = await request.json().catch(() => null);
  const reason = trimOrNull(payload?.reason);

  if (!reason) {
    return NextResponse.json(
      { error: "Debes indicar el motivo de anulacion." },
      { status: 400 },
    );
  }

  try {
    const { data, error } = await supabase.rpc("cancel_cash_movement", {
      p_cash_movement_id: movementId,
      p_cancelled_reason: reason,
    });

    if (error || !data) {
      throw new Error(error?.message ?? "No se pudo anular el movimiento.");
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    console.error("[cash/movements/cancel] Error al anular movimiento", {
      message,
      movementId,
    });
    return NextResponse.json(
      { error: mapCashErrorMessage(message) },
      { status: 400 },
    );
  }
}
