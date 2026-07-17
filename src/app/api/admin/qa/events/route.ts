import { NextResponse } from "next/server";

import { registerQaFinding, registerQaScenarioResult } from "@/lib/qa/qa-findings";
import { archiveQaEntity, registerQaEntity } from "@/lib/qa/qa-registry";
import { requireQaOwnerContext } from "@/lib/qa/qa-run";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);

  try {
    const context = await requireQaOwnerContext();
    if (payload?.action === "scenario") {
      return NextResponse.json({ data: await registerQaScenarioResult(payload.data, context) });
    }
    if (payload?.action === "entity") {
      return NextResponse.json({ data: await registerQaEntity(payload.data, context) });
    }
    if (payload?.action === "finding") {
      return NextResponse.json({ data: await registerQaFinding(payload.data, context) });
    }
    if (payload?.action === "archive_entity") {
      return NextResponse.json({ data: await archiveQaEntity(payload.data?.registryId, context) });
    }

    return NextResponse.json({ error: "La accion QA no es valida." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    console.error("[qa/events] No se pudo registrar la evidencia", {
      action: payload?.action ?? null,
      message,
    });
    const status = message.includes("Solo owner") ? 403 : message.includes("sesion QA") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
