import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/supabase/route-auth";
import { createClient } from "@/lib/supabase/server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const branchId = body?.branchId;
  const action = body?.action;
  if (!uuid.test(branchId ?? "") || !["archive", "restore", "archive_expired"].includes(action)) {
    return NextResponse.json({ error: "Solicitud de archivo inválida." }, { status: 400 });
  }

  const supabase = await createClient();
  let outcome: { data: number | null; error: { code?: string; message: string } | null };
  if (action === "archive_expired") {
    outcome = await supabase.rpc("archive_expired_hotspot_vouchers", { p_branch_id: branchId });
  } else {
    const ids = body?.voucherIds;
    if (!Array.isArray(ids) || !ids.length || ids.length > 100 || !ids.every((id: unknown) => typeof id === "string" && uuid.test(id))) {
      return NextResponse.json({ error: "Selecciona entre 1 y 100 accesos válidos." }, { status: 400 });
    }
    outcome = await supabase.rpc("set_hotspot_voucher_archived", {
      p_branch_id: branchId,
      p_voucher_ids: ids,
      p_archived: action === "archive",
    });
  }

  if (outcome.error) {
    console.error("[wifi/archive] Error al actualizar historial", { code: outcome.error.code });
    return NextResponse.json({ error: outcome.error.message ?? "No se pudo actualizar el historial." }, { status: 400 });
  }
  return NextResponse.json({ success: true, changed: Number(outcome.data ?? 0) });
}
