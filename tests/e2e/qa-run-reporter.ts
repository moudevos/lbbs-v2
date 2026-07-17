import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import type { FullResult, Reporter } from "@playwright/test/reporter";

export default class QaRunReporter implements Reporter {
  onBegin() {
    console.log("[qa/runtime] tests started");
  }

  async onEnd(result: FullResult) {
    console.log(`[qa/runtime] tests finished: ${result.status}`);
    await rm(path.resolve(process.cwd(), ".qa", "server.json"), { force: true });
    if (!process.env.QA_RUN_CODE) return;
    try {
      const run = JSON.parse(await readFile(path.resolve(process.cwd(), ".qa", "current-run.json"), "utf8")) as { id: string; runCode: string };
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const email = process.env.QA_EMAIL;
      const password = process.env.QA_PASSWORD;
      if (!url || !key || !email || !password) throw new Error("Faltan variables QA para cerrar el run.");
      const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const auth = await client.auth.signInWithPassword({ email, password });
      if (auth.error) throw auth.error;
      const finalStatus = result.status === "passed" ? "passed" : result.status === "interrupted" ? "blocked" : "failed";
      const update = await client.from("qa_runs").update({
        status: finalStatus,
        result: finalStatus,
        finished_at: new Date().toISOString(),
        notes: `Playwright finalizo con estado ${result.status}.`,
      }).eq("id", run.id).eq("run_code", run.runCode);
      if (update.error) throw update.error;
      await client.auth.signOut({ scope: "local" });
      console.log(`[qa/runtime] run closed: ${run.runCode} (${finalStatus})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error(`[qa/runtime] run close failed: ${message}`);
    }
  }
}
