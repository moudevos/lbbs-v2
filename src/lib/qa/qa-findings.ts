import "server-only";

import { requireQaOwnerContext, sanitizeQaMetadata, type QaContext } from "@/lib/qa/qa-run";

export async function registerQaScenarioResult(input: {
  qaRunId: string;
  scenarioCode: string;
  module: string;
  status: "pending" | "running" | "passed" | "failed" | "blocked" | "not_run";
  severity?: "P0" | "P1" | "P2" | "P3" | null;
  expectedResult?: string | null;
  actualResult?: string | null;
  durationMs?: number | null;
  evidence?: Record<string, unknown>;
  startedAt?: string | null;
  finishedAt?: string | null;
}, context?: QaContext) {
  const { supabase } = context ?? await requireQaOwnerContext();
  const { data, error } = await supabase
    .from("qa_scenario_results")
    .upsert(
      {
        qa_run_id: input.qaRunId,
        scenario_code: input.scenarioCode,
        module: input.module,
        status: input.status,
        severity: input.severity ?? null,
        expected_result: input.expectedResult ?? null,
        actual_result: input.actualResult ?? null,
        duration_ms: input.durationMs ?? null,
        evidence: sanitizeQaMetadata(input.evidence),
        started_at: input.startedAt ?? null,
        finished_at: input.finishedAt ?? null,
      },
      { onConflict: "qa_run_id,scenario_code" },
    )
    .select("id, scenario_code, status, severity")
    .single();

  if (error) {
    console.error("[qa/scenario] No se pudo registrar el resultado", {
      code: error.code,
      message: error.message,
      qaRunId: input.qaRunId,
      scenarioCode: input.scenarioCode,
    });
    throw new Error("No se pudo registrar el resultado QA.");
  }

  return data;
}

export async function registerQaFinding(input: {
  qaRunId: string;
  findingCode: string;
  severity: "P0" | "P1" | "P2" | "P3";
  module: string;
  title: string;
  status: "open" | "in_progress" | "fixed" | "verified" | "accepted" | "closed";
  expectedResult?: string | null;
  actualResult?: string | null;
  rootCause?: string | null;
  fixSummary?: string | null;
  regressionResult?: string | null;
  metadata?: Record<string, unknown>;
}, context?: QaContext) {
  const { supabase } = context ?? await requireQaOwnerContext();
  const { data: existingFinding, error: lookupError } = await supabase
    .from("qa_findings")
    .select("id, qa_run_id")
    .eq("finding_code", input.findingCode)
    .maybeSingle();

  if (lookupError) {
    console.error("[qa/finding] No se pudo localizar el hallazgo", {
      code: lookupError.code,
      message: lookupError.message,
      findingCode: input.findingCode,
    });
    throw new Error("No se pudo localizar el hallazgo QA.");
  }

  const findingPayload = {
    severity: input.severity,
    module: input.module,
    title: input.title,
    status: input.status,
    expected_result: input.expectedResult ?? null,
    actual_result: input.actualResult ?? null,
    root_cause: input.rootCause ?? null,
    fix_summary: input.fixSummary ?? null,
    regression_result: input.regressionResult ?? null,
    metadata: sanitizeQaMetadata(input.metadata),
  };

  if (existingFinding) {
    const { data, error } = await supabase
      .from("qa_findings")
      .update(findingPayload)
      .eq("id", existingFinding.id)
      .select("id, finding_code, severity, status")
      .single();

    if (error) {
      console.error("[qa/finding] No se pudo actualizar el hallazgo", {
        code: error.code,
        message: error.message,
        findingCode: input.findingCode,
      });
      throw new Error("No se pudo actualizar el hallazgo QA.");
    }

    return data;
  }

  const { data, error } = await supabase
    .from("qa_findings")
    .insert({
      qa_run_id: input.qaRunId,
      finding_code: input.findingCode,
      ...findingPayload,
    })
    .select("id, finding_code, severity, status")
    .single();

  if (error) {
    console.error("[qa/finding] No se pudo registrar el hallazgo", {
      code: error.code,
      message: error.message,
      findingCode: input.findingCode,
    });
    throw new Error("No se pudo registrar el hallazgo QA.");
  }

  return data;
}
