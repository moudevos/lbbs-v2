import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/supabase/route-auth";

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export async function POST(request: Request, context: { params: Promise<{ saleId: string }> }) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const body = await request.json().catch(() => null);
  const { saleId } = await context.params;
  if (!isUuid(saleId)) return NextResponse.json({ error: "El identificador de venta no es valido." }, { status: 400 });
  if (!body?.reasonId) return NextResponse.json({ error: "Selecciona un motivo." }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reverse_completed_sale_historical", { p_sale_id: saleId, p_reason_id: body.reasonId, p_notes: typeof body.notes === "string" ? body.notes.trim() || null : null, p_refunds: Array.isArray(body.refunds) ? body.refunds : [] });
  if (error) return NextResponse.json({ error: error.message || "No se pudo revertir la venta." }, { status: 400 });
  return NextResponse.json({ data });
}
