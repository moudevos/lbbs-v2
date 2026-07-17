import "server-only";

import { requireQaOwnerContext, sanitizeQaMetadata, type QaContext } from "@/lib/qa/qa-run";

export async function registerQaEntity(input: {
  qaRunId: string;
  entityTable: string;
  entityId: string;
  entitySchema?: string;
  entityType?: string | null;
  scenarioCode?: string | null;
  lifecycleStatus?: "active" | "incomplete" | "cancelled" | "archived";
  metadata?: Record<string, unknown>;
}, context?: QaContext) {
  const { supabase } = context ?? await requireQaOwnerContext();
  const lifecycleStatus = input.lifecycleStatus ?? "active";
  const { data, error } = await supabase
    .from("qa_entity_registry")
    .upsert(
      {
        qa_run_id: input.qaRunId,
        entity_schema: input.entitySchema ?? "public",
        entity_table: input.entityTable,
        entity_id: input.entityId,
        entity_type: input.entityType ?? null,
        scenario_code: input.scenarioCode ?? null,
        lifecycle_status: lifecycleStatus,
        archived_at: lifecycleStatus === "archived" ? new Date().toISOString() : null,
        metadata: sanitizeQaMetadata(input.metadata),
      },
      { onConflict: "qa_run_id,entity_schema,entity_table,entity_id" },
    )
    .select("id, qa_run_id, entity_table, entity_id, lifecycle_status")
    .single();

  if (error) {
    console.error("[qa/registry] No se pudo registrar la entidad", {
      code: error.code,
      message: error.message,
      qaRunId: input.qaRunId,
      entityTable: input.entityTable,
    });
    throw new Error("No se pudo registrar la entidad QA.");
  }

  return data;
}

export async function archiveQaEntity(registryId: string, context?: QaContext) {
  const { supabase } = context ?? await requireQaOwnerContext();
  const { data, error } = await supabase
    .from("qa_entity_registry")
    .update({ lifecycle_status: "archived", archived_at: new Date().toISOString() })
    .eq("id", registryId)
    .select("id, lifecycle_status, archived_at")
    .single();

  if (error) {
    console.error("[qa/registry] No se pudo archivar la entidad", {
      code: error.code,
      message: error.message,
      registryId,
    });
    throw new Error("No se pudo archivar la entidad QA.");
  }

  return data;
}
