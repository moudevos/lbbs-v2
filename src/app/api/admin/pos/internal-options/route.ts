import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requirePosWriteSession } from "@/lib/supabase/route-auth";

export async function GET(request: Request) {
  const auth = await requirePosWriteSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get("customerId")?.trim();
  const branchId = searchParams.get("branchId")?.trim();
  if (!customerId || !branchId) return NextResponse.json({ error: "Falta cliente o sede." }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_pos_internal_options", {
    p_customer_id: customerId,
    p_branch_id: branchId,
  });

  if (error) {
    const status = error.message.includes("permisos") ? 403 : 500;
    return NextResponse.json(
      { error: status === 403 ? error.message : "No se pudieron cargar las opciones internas." },
      { status },
    );
  }

  return NextResponse.json({ data });
}
