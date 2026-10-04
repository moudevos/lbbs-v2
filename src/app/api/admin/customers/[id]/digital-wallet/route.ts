import { NextResponse } from "next/server";

import { requireCustomerWriteSession } from "@/lib/supabase/route-auth";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCustomerWriteSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { id } = await params;
  const { data, error } = await (await createClient()).rpc("get_customer_digital_wallet_status", { p_customer_id: id });
  return error ? NextResponse.json({ error: "No se pudo consultar la tarjeta digital." }, { status: 400 }) : NextResponse.json({ data });
}
