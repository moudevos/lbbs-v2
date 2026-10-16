import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/supabase/route-auth";
import { createClient } from "@/lib/supabase/server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const branchId = body?.branchId;
  const reason = body?.reason;

  if (!uuid.test(id) || !uuid.test(branchId ?? "") ||
    !["manual_revoke", "manual_disconnect"].includes(reason)) {
    return NextResponse.json({ error: "Solicitud de revocación inválida." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_hotspot_voucher_revocation", {
    p_voucher_id: id,
    p_branch_id: branchId,
    p_reason: reason,
  });

  if (error) {
    console.error("[wifi/revoke] No se pudo solicitar revocación", { code: error.code });
    return NextResponse.json(
      { error: error.message || "No se pudo programar la desconexión." },
      { status: 400 },
    );
  }

  const result = Array.isArray(data) ? data[0] : null;
  if (!result || !["queued", "already_queued", "revoked"].includes(result.outcome)) {
    return NextResponse.json({ error: "No se pudo confirmar la solicitud." }, { status: 500 });
  }

  return NextResponse.json({
    status: result.outcome === "revoked" ? "revoked" : "revocation_pending",
    commandId: result.command_id ?? null,
  });
}
