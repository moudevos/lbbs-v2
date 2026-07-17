import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Falta ${name} para preparar el run QA.`);
  return value;
}

export default async function globalSetup() {
  if (!process.env.QA_RUN_CODE) {
    console.log("[qa/runtime] unmanaged Playwright run");
    return;
  }
  const client = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const auth = await client.auth.signInWithPassword({ email: required("QA_EMAIL"), password: required("QA_PASSWORD") });
  if (auth.error) throw new Error("No se pudo autenticar el global setup QA.");

  const runCode = process.env.QA_RUN_CODE;

  const existing = await client.from("qa_runs").select("id,run_code,status").eq("run_code", runCode).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data && !["preparing", "running"].includes(existing.data.status)) {
    throw new Error(`El run ${runCode} ya esta cerrado.`);
  }

  let run = existing.data;
  if (!run) {
    const employee = await client.rpc("current_employee_id");
    if (employee.error || !employee.data) throw new Error("No se pudo identificar al owner QA.");
    const inserted = await client.from("qa_runs").insert({
      run_code: runCode,
      sprint_number: 9,
      iteration_number: 11,
      status: "running",
      started_by: employee.data,
      notes: "Certificacion integral del Sprint 9, iteracion 11.",
      metadata: { runner: "playwright", visual: process.env.QA_VISUAL === "true" },
    }).select("id,run_code,status").single();
    if (inserted.error) throw inserted.error;
    run = inserted.data;
  } else if (run.status === "preparing") {
    const updated = await client.from("qa_runs").update({ status: "running" }).eq("id", run.id).select("id,run_code,status").single();
    if (updated.error) throw updated.error;
    run = updated.data;
  }

  const qaDirectory = path.resolve(process.cwd(), ".qa");
  await mkdir(qaDirectory, { recursive: true });
  await writeFile(path.join(qaDirectory, "current-run.json"), JSON.stringify({ id: run.id, runCode: run.run_code }, null, 2), "utf8");
  await client.auth.signOut({ scope: "local" });
  console.log(`[qa/runtime] run ready: ${run.run_code}`);
}
