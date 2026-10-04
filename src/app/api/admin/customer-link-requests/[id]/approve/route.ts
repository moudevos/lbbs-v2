import { NextResponse } from "next/server";

import { requireCustomerWriteSession } from "@/lib/supabase/route-auth";
import { createClient } from "@/lib/supabase/server";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCustomerWriteSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("approve_customer_link_request", { p_request_id: id });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const { data: request } = await supabase.from("customer_link_requests").select("code_expires_at").eq("id", id).maybeSingle();
  return NextResponse.json({ data: { ...(data as object), expiresAt: request?.code_expires_at ?? null } });
}
