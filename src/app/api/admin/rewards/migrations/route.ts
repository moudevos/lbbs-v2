import { NextResponse } from "next/server";

import {
  mapRewardsErrorMessage,
  parseNumber,
  trimOrNull,
} from "@/app/api/admin/rewards/route-helpers";
import { createClient } from "@/lib/supabase/server";
import { requireRewardsWriteSession } from "@/lib/supabase/route-auth";

export async function POST(request: Request) {
  const auth = await requireRewardsWriteSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const payload = await request.json().catch(() => null);
  const customerId = trimOrNull(payload?.customer_id);
  const stickers = parseNumber(payload?.stickers);
  const note = trimOrNull(payload?.note);
  const serviceId = trimOrNull(payload?.service_id);

  if (!customerId || stickers === null || stickers <= 0 || !note) {
    return NextResponse.json(
      { error: "Completa cliente, stickers y nota obligatoria." },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  try {
    const { data, error } = await supabase.rpc("register_reward_card_migration", {
      p_customer_id: customerId,
      p_stickers: Number(stickers.toFixed(2)),
      p_note: note,
      p_service_id: serviceId,
    });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    console.error("[rewards/migration/post] Error al registrar migracion", {
      message,
      customerId,
    });
    return NextResponse.json(
      { error: mapRewardsErrorMessage(message) },
      { status: 400 },
    );
  }
}
