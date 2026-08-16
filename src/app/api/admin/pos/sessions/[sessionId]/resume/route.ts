import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requirePosWriteSession } from "@/lib/supabase/route-auth";

export async function POST(_request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const auth = await requirePosWriteSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { sessionId } = await context.params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resume_pos_session", { p_session_id: sessionId });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}
