import { NextResponse } from "next/server";

import { requireCustomerWriteSession } from "@/lib/supabase/route-auth";
import { createClient } from "@/lib/supabase/server";
import { scheduleWalletSyncKick } from "@/lib/wallet/wallet-sync-kick";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCustomerWriteSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { id } = await params;
  const { data, error } = await (await createClient()).rpc("admin_rotate_customer_public_token", { p_customer_id: id });
  if (!error) scheduleWalletSyncKick("qr_rotation");
  return error ? NextResponse.json({ error: "No se pudo regenerar el QR." }, { status: 400 }) : NextResponse.json({ data });
}
