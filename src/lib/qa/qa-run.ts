import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

export type QaRunStatus =
  | "preparing"
  | "running"
  | "blocked"
  | "failed"
  | "passed"
  | "passed_with_observations"
  | "archived";

export type QaRunResult = "passed" | "passed_with_observations" | "failed" | "blocked";

export type QaContext = {
  supabase: SupabaseClient;
  employeeId: string;
};

function assertQaEnvironment() {
  const qaBaseUrl = process.env.QA_BASE_URL ?? "";
  const isLocalQa = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(qaBaseUrl);

  if (
    process.env.QA_ALLOW_WRITES !== "true" ||
    process.env.QA_RESET_CONFIRMED !== "true" ||
    !isLocalQa
  ) {
    throw new Error("El laboratorio QA no esta habilitado para escritura.");
  }
}

export function sanitizeQaMetadata(value: Record<string, unknown> | undefined) {
  const forbidden = /(password|token|cookie|secret|authorization|recovery|service.?role)/i;

  function sanitizeEntry(entry: unknown): unknown {
    if (Array.isArray(entry)) {
      return entry.map(sanitizeEntry);
    }

    if (entry && typeof entry === "object") {
      return Object.fromEntries(
        Object.entries(entry)
          .filter(([key]) => !forbidden.test(key))
          .map(([key, nestedValue]) => [key, sanitizeEntry(nestedValue)]),
      );
    }

    return entry;
  }

  return (sanitizeEntry(value ?? {}) ?? {}) as Record<string, unknown>;
}

export async function requireQaOwnerContext(): Promise<QaContext> {
  assertQaEnvironment();
  const supabase = await createClient();
  const [{ data: userData, error: userError }, { data: role, error: roleError }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("current_user_role"),
  ]);

  if (userError || !userData.user) {
    throw new Error("No se pudo validar la sesion QA.");
  }

  if (roleError || role !== "owner") {
    throw new Error("Solo owner puede preparar ejecuciones QA.");
  }

  const { data: employeeId, error: employeeError } = await supabase.rpc("current_employee_id");
  if (employeeError || !employeeId) {
    throw new Error("No se pudo identificar al responsable QA.");
  }

  return { supabase, employeeId };
}

function formatRunDate(date: Date) {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

export async function createQaRun(input: {
  preferredRunCode?: string | null;
  sprintNumber?: number;
  iterationNumber?: number;
  appCommit?: string | null;
  appBranch?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { supabase, employeeId } = await requireQaOwnerContext();
  const runDate = formatRunDate(new Date());

  if (input.preferredRunCode) {
    if (!/^QA_RUN_[0-9]{8}_[0-9]{3,}$/.test(input.preferredRunCode)) {
      throw new Error("El codigo de ejecucion QA no es valido.");
    }

    const { data: preferredRun, error: preferredError } = await supabase
      .from("qa_runs")
      .select("id, run_code, status, started_at")
      .eq("run_code", input.preferredRunCode)
      .maybeSingle();

    if (preferredError) {
      console.error("[qa/run] No se pudo consultar el codigo preferido", {
        code: preferredError.code,
        message: preferredError.message,
      });
      throw new Error("No se pudo consultar la ejecucion QA.");
    }

    if (preferredRun && ["preparing", "running"].includes(preferredRun.status)) {
      if (preferredRun.status === "preparing") {
        const { data: runningRun, error: runningError } = await supabase
          .from("qa_runs")
          .update({ status: "running" })
          .eq("id", preferredRun.id)
          .select("id, run_code, status, started_at")
          .single();

        if (runningError) {
          throw new Error("No se pudo iniciar la ejecucion QA existente.");
        }

        return runningRun;
      }

      return preferredRun;
    }

    if (!preferredRun) {
      const { data: createdPreferredRun, error: preferredInsertError } = await supabase
        .from("qa_runs")
        .insert({
          run_code: input.preferredRunCode,
          sprint_number: input.sprintNumber ?? 9,
          iteration_number: input.iterationNumber ?? 10,
          status: "running",
          app_commit: input.appCommit ?? null,
          app_branch: input.appBranch ?? null,
          started_by: employeeId,
          notes: input.notes ?? null,
          metadata: sanitizeQaMetadata(input.metadata),
        })
        .select("id, run_code, status, started_at")
        .single();

      if (!preferredInsertError && createdPreferredRun) {
        return createdPreferredRun;
      }

      if (preferredInsertError?.code !== "23505") {
        console.error("[qa/run] No se pudo crear el codigo preferido", {
          code: preferredInsertError?.code,
          message: preferredInsertError?.message,
        });
        throw new Error("No se pudo crear la ejecucion QA.");
      }
    }
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data: latestRun, error: latestError } = await supabase
      .from("qa_runs")
      .select("run_code")
      .like("run_code", `QA_RUN_${runDate}_%`)
      .order("run_code", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestError) {
      console.error("[qa/run] No se pudo calcular el codigo de ejecucion", {
        code: latestError.code,
        message: latestError.message,
      });
      throw new Error("No se pudo preparar el codigo de ejecucion QA.");
    }

    const currentSequence = Number(latestRun?.run_code.split("_").at(-1) ?? "0");
    const runCode = `QA_RUN_${runDate}_${String(currentSequence + 1).padStart(3, "0")}`;
    const { data, error } = await supabase
      .from("qa_runs")
      .insert({
        run_code: runCode,
        sprint_number: input.sprintNumber ?? 9,
        iteration_number: input.iterationNumber ?? 10,
        status: "running",
        app_commit: input.appCommit ?? null,
        app_branch: input.appBranch ?? null,
        started_by: employeeId,
        notes: input.notes ?? null,
        metadata: sanitizeQaMetadata(input.metadata),
      })
      .select("id, run_code, status, started_at")
      .single();

    if (!error && data) {
      return data;
    }

    if (error?.code !== "23505") {
      console.error("[qa/run] No se pudo crear la ejecucion", {
        code: error?.code,
        message: error?.message,
      });
      throw new Error("No se pudo crear la ejecucion QA.");
    }
  }

  throw new Error("No se pudo reservar un codigo unico para la ejecucion QA.");
}

export async function finishQaRun(
  qaRunId: string,
  status: Exclude<QaRunStatus, "preparing" | "running" | "archived">,
  result: QaRunResult,
  notes?: string | null,
) {
  const { supabase } = await requireQaOwnerContext();
  const { data, error } = await supabase
    .from("qa_runs")
    .update({ status, result, notes: notes ?? null, finished_at: new Date().toISOString() })
    .eq("id", qaRunId)
    .select("id, run_code, status, result, finished_at")
    .single();

  if (error) {
    console.error("[qa/run] No se pudo finalizar la ejecucion", {
      code: error.code,
      message: error.message,
      qaRunId,
    });
    throw new Error("No se pudo finalizar la ejecucion QA.");
  }

  return data;
}

export async function getCurrentQaRun() {
  const { supabase } = await requireQaOwnerContext();
  const { data, error } = await supabase
    .from("qa_runs")
    .select("id, run_code, status, started_at, app_commit, app_branch")
    .in("status", ["preparing", "running"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[qa/run] No se pudo leer la ejecucion activa", {
      code: error.code,
      message: error.message,
    });
    throw new Error("No se pudo leer la ejecucion QA activa.");
  }

  return data;
}
