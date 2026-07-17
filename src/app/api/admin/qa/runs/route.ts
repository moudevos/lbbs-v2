import { NextResponse } from "next/server";

import { createQaRun, finishQaRun, getCurrentQaRun } from "@/lib/qa/qa-run";
import { requireAdminSession } from "@/lib/supabase/route-auth";

async function requireQaOwner() {
  const auth = await requireAdminSession();

  if (!auth.ok) {
    return { ok: false as const, response: NextResponse.json({ error: auth.message }, { status: auth.status }) };
  }

  if (auth.role !== "owner") {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Solo owner puede administrar ejecuciones QA." }, { status: 403 }),
    };
  }

  return { ok: true as const };
}

export async function GET() {
  const access = await requireQaOwner();
  if (!access.ok) return access.response;

  try {
    return NextResponse.json({ data: await getCurrentQaRun() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    console.error("[qa/runs] No se pudo consultar la ejecucion", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await requireQaOwner();
  if (!access.ok) return access.response;

  const payload = await request.json().catch(() => null);

  try {
    const data = await createQaRun({
      preferredRunCode: typeof payload?.run_code === "string" ? payload.run_code : null,
      sprintNumber: 9,
      iterationNumber: 10,
      appCommit: typeof payload?.app_commit === "string" ? payload.app_commit : null,
      appBranch: typeof payload?.app_branch === "string" ? payload.app_branch : null,
      notes: typeof payload?.notes === "string" ? payload.notes : null,
      metadata: payload?.metadata && typeof payload.metadata === "object" ? payload.metadata : undefined,
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    console.error("[qa/runs] No se pudo crear la ejecucion", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const access = await requireQaOwner();
  if (!access.ok) return access.response;

  const payload = await request.json().catch(() => null);
  const validStatuses = ["blocked", "failed", "passed", "passed_with_observations"] as const;
  const status = validStatuses.find((value) => value === payload?.status);

  if (!payload?.qa_run_id || !status || payload?.result !== status) {
    return NextResponse.json({ error: "El cierre de la ejecucion QA no es valido." }, { status: 400 });
  }

  try {
    const data = await finishQaRun(
      payload.qa_run_id,
      status,
      status,
      typeof payload?.notes === "string" ? payload.notes : null,
    );
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    console.error("[qa/runs] No se pudo cerrar la ejecucion", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
