import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireReservationWriteSession } from "@/lib/supabase/route-auth";

function trimOrNull(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseMoney(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    if (!normalized) {
      return 0;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export async function POST(request: Request) {
  const auth = await requireReservationWriteSession();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const payload = await request.json().catch(() => null);
  const branchId = trimOrNull(payload?.branch_id);
  const openingCashAmount = parseMoney(payload?.opening_cash_amount);
  const notes = trimOrNull(payload?.notes);

  if (!branchId) {
    return NextResponse.json({ error: "La sede es obligatoria." }, { status: 400 });
  }

  if (openingCashAmount === null || openingCashAmount < 0) {
    return NextResponse.json(
      { error: "El monto inicial debe ser mayor o igual a cero." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_pos_session", {
    p_branch_id: branchId,
    p_opening_cash_amount: openingCashAmount,
    p_notes: notes,
  });

  if (error) {
    console.error("[pos/open-session] Error al abrir sesion POS", {
      message: error.message,
      code: error.code,
      branchId,
    });
    return NextResponse.json(
      { error: "No se pudo abrir la sesion POS para esta sede." },
      { status: 400 },
    );
  }

  return NextResponse.json({ data });
}
