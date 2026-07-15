import { NextResponse } from "next/server";

import {
  isValidCashMovementType,
  mapCashErrorMessage,
  parseMoney,
  trimOrNull,
} from "@/app/api/admin/cash/route-helpers";
import { createClient } from "@/lib/supabase/server";
import { requireCashWriteSession } from "@/lib/supabase/route-auth";

export async function POST(request: Request) {
  const auth = await requireCashWriteSession();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const supabase = await createClient();
  const payload = await request.json().catch(() => null);
  const posSessionId = trimOrNull(payload?.pos_session_id);
  const categoryId = trimOrNull(payload?.category_id);
  const movementType = trimOrNull(payload?.movement_type);
  const amount = parseMoney(payload?.amount);
  const description = trimOrNull(payload?.description);
  const evidenceUrl = trimOrNull(payload?.evidence_url);

  if (!posSessionId) {
    return NextResponse.json(
      { error: "No hay una sesion POS abierta para registrar el movimiento." },
      { status: 400 },
    );
  }

  if (!categoryId) {
    return NextResponse.json(
      { error: "Selecciona una categoria para continuar." },
      { status: 400 },
    );
  }

  if (!isValidCashMovementType(movementType)) {
    return NextResponse.json(
      { error: "Selecciona un tipo de movimiento valido." },
      { status: 400 },
    );
  }

  if (amount === null || amount <= 0) {
    return NextResponse.json(
      { error: "Ingresa un monto mayor a cero." },
      { status: 400 },
    );
  }

  if (!description) {
    return NextResponse.json(
      { error: "La descripcion es obligatoria." },
      { status: 400 },
    );
  }

  try {
    const { data, error } = await supabase.rpc("create_cash_movement", {
      p_pos_session_id: posSessionId,
      p_category_id: categoryId,
      p_movement_type: movementType,
      p_amount: Number(amount.toFixed(2)),
      p_description: description,
      p_evidence_url: evidenceUrl,
    });

    if (error || !data) {
      throw new Error(error?.message ?? "No se pudo registrar el movimiento.");
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    console.error("[cash/movements/post] Error al crear movimiento", {
      message,
      posSessionId,
      categoryId,
      movementType,
    });
    return NextResponse.json(
      { error: mapCashErrorMessage(message) },
      { status: 400 },
    );
  }
}
