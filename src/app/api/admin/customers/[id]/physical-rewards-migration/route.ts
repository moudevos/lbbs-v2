import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCustomerWriteSession } from "@/lib/supabase/route-auth";
import { createClient } from "@/lib/supabase/server";
import { scheduleWalletSyncKick } from "@/lib/wallet/wallet-sync-kick";

const schema = z.object({ stickers: z.coerce.number().positive().max(1000), notes: z.string().trim().max(500).optional() });
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCustomerWriteSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ingresa una cantidad válida de sellos." }, { status: 400 });
  const { id } = await params;
  const { data, error } = await (await createClient()).rpc("migrate_customer_physical_rewards", { p_customer_id: id, p_stickers: parsed.data.stickers, p_notes: parsed.data.notes || "Migración de tarjeta física." });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  scheduleWalletSyncKick("physical_migration");
  return NextResponse.json({ data });
}
