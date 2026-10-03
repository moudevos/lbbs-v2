import { NextResponse } from "next/server";
import { requireCustomerWriteSession } from "@/lib/supabase/route-auth";
import { createClient } from "@/lib/supabase/server";
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) { const auth = await requireCustomerWriteSession(); if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status }); const { id } = await params; const { error } = await (await createClient()).rpc("reject_customer_link_request", { p_request_id: id }); if (error) return NextResponse.json({ error: error.message }, { status: 400 }); return NextResponse.json({ ok: true }); }
