import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requirePosWriteSession } from "@/lib/supabase/route-auth";

// Confirma el PIN antes de aplicar visualmente una operación sin cobro. El
// checkout lo valida otra vez dentro de su flujo protegido: esta ruta mejora
// la experiencia, no sustituye el control definitivo del cierre.
export async function POST(request: Request) {
  const auth = await requirePosWriteSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const pin = typeof body?.pin === "string" ? body.pin.trim() : "";
  const branchId = typeof body?.branchId === "string" ? body.branchId.trim() : "";
  if (!/^\d{6,12}$/.test(pin)) {
    return NextResponse.json(
      { error: "Ingresa un PIN de autorización de 6 a 12 dígitos." },
      { status: 400 },
    );
  }
  if (!branchId) {
    return NextResponse.json({ error: "No se pudo identificar la sede del POS." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: authorizedBy, error } = await supabase.rpc(
    "authorize_internal_complimentary_sale",
    { p_pin: pin, p_branch_id: branchId },
  );

  if (error) {
    console.error("[pos/internal-authorization] Error al verificar PIN", {
      message: error.message,
      code: error.code,
    });
    return NextResponse.json({ error: "No se pudo verificar el PIN de autorización." }, { status: 500 });
  }

  if (!authorizedBy) {
    return NextResponse.json({ error: "El PIN de autorización no es válido." }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
