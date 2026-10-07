import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { readHotspotToken } from "@/lib/hotspot/captive";
import { captiveJson, captiveOptions } from "@/lib/hotspot/cors";
const NextResponse = { json: captiveJson };
export function OPTIONS() { return captiveOptions(); }
export async function POST(request: Request) { const body = await request.json().catch(() => null); const token = readHotspotToken(body?.claimToken); if (!token) return NextResponse.json({ error: "No pudimos completar el acceso. Inténtalo nuevamente." }, { status: 400 }); const { data } = await getSupabaseAdmin().from("wifi_access_vouchers").select("status,session_expires_at").eq("id",String(token.voucherId)).maybeSingle(); if (!data) return NextResponse.json({ error: "No pudimos completar el acceso. Inténtalo nuevamente." }, { status: 400 }); return NextResponse.json({ status: data.status, sessionExpiresAt: data.session_expires_at }); }
