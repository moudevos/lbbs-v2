import { NextResponse } from "next/server";

import {
  normalizeCode,
  parseSortOrder,
  toFriendlyDatabaseError,
  trimOrNull,
} from "@/app/api/admin/settings/route-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/supabase/route-auth";

const selectFields =
  "id, code, name, description, sort_order, is_active, payment_kind, allows_change, counts_as_cash, created_at, updated_at";

const paymentKinds = new Set(["cash", "wallet_qr", "card", "bank_transfer", "other_digital"]);

function getPaymentProperties(value: unknown) {
  const paymentKind = typeof value === "string" && paymentKinds.has(value) ? value : "other_digital";
  return {
    payment_kind: paymentKind,
    allows_change: paymentKind === "cash",
    counts_as_cash: paymentKind === "cash",
  };
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminSession();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id } = await params;
  const payload = await request.json().catch(() => null);
  const codeRaw = trimOrNull(payload?.code);
  const name = trimOrNull(payload?.name);

  if (!codeRaw || !name) {
    return NextResponse.json(
      { error: "Codigo y nombre son obligatorios." },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("payment_methods")
    .update({
      code: normalizeCode(codeRaw),
      name,
      description: trimOrNull(payload?.description),
      sort_order: parseSortOrder(payload?.sort_order),
      is_active: payload?.is_active !== false,
      ...getPaymentProperties(payload?.payment_kind),
    })
    .eq("id", id)
    .select(selectFields)
    .single();

  if (error) {
    console.error("[payment-methods/put] Error al actualizar metodo", {
      message: error.message,
      code: error.code,
      methodId: id,
    });
    return NextResponse.json(
      {
        error: toFriendlyDatabaseError(
          error,
          "No se pudo actualizar el metodo de pago.",
        ),
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ data });
}
