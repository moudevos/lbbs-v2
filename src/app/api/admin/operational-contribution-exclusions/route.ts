import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/supabase/route-auth";

export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("operational_contribution_service_exclusions")
    .select("id,service_id,effective_from,service:services(name)")
    .is("effective_to", null)
    .order("effective_from", { ascending: false });

  if (error) {
    console.error("[operational-exclusions/get] Error", { message: error.message, code: error.code });
    return NextResponse.json({ error: "No se pudieron cargar los servicios excluidos." }, { status: 500 });
  }

  return NextResponse.json({
    data: (data ?? []).map((row) => {
      const relation = row.service as unknown;
      const service = Array.isArray(relation) ? relation[0] : relation;
      const serviceName = service && typeof service === "object" && "name" in service && typeof service.name === "string"
        ? service.name
        : "Servicio";
      return { id: row.id, serviceId: row.service_id, serviceName, effectiveFrom: row.effective_from };
    }),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const serviceId = typeof body?.serviceId === "string" ? body.serviceId : "";
  if (!serviceId) return NextResponse.json({ error: "Selecciona un servicio." }, { status: 400 });

  const supabase = await createClient();
  const [{ data: employeeId }, service] = await Promise.all([
    supabase.rpc("current_employee_id"),
    supabase.from("services").select("id").eq("id", serviceId).eq("is_active", true).maybeSingle(),
  ]);
  if (service.error || !service.data) return NextResponse.json({ error: "El servicio ya no está disponible." }, { status: 404 });

  const { data, error } = await supabase
    .from("operational_contribution_service_exclusions")
    .insert({ service_id: serviceId, created_by: employeeId ?? null })
    .select("id")
    .single();

  if (error) {
    const duplicate = error.code === "23505";
    return NextResponse.json({ error: duplicate ? "Este servicio ya está excluido del aporte." : "No se pudo guardar la exclusión." }, { status: duplicate ? 409 : 400 });
  }
  return NextResponse.json({ data });
}

export async function PATCH(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Selecciona una exclusión." }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("operational_contribution_service_exclusions")
    .update({ effective_to: new Date().toISOString() })
    .eq("id", id)
    .is("effective_to", null)
    .select("id")
    .maybeSingle();

  if (error || !data) return NextResponse.json({ error: "La exclusión ya no está activa." }, { status: 400 });
  return NextResponse.json({ data });
}
