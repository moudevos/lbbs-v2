import { NextResponse } from "next/server";

import { mapRewardsErrorMessage, trimOrNull } from "@/app/api/admin/rewards/route-helpers";
import { recalculateCustomerRewardsById } from "@/app/api/admin/rewards/recalculate-helpers";
import { requireRewardsWriteSession } from "@/lib/supabase/route-auth";

export async function POST(request: Request) {
  const auth = await requireRewardsWriteSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const payload = await request.json().catch(() => null);
  const customerId = trimOrNull(payload?.customer_id);

  if (!customerId) {
    return NextResponse.json(
      { error: "Selecciona un cliente valido para recalcular rewards." },
      { status: 400 },
    );
  }

  try {
    const created = await recalculateCustomerRewardsById(customerId);
    return NextResponse.json({ data: { created } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    console.error("[rewards/recalculate/post] Error al recalcular rewards", {
      message,
      customerId,
    });
    return NextResponse.json(
      { error: mapRewardsErrorMessage(message) },
      { status: 400 },
    );
  }
}
