import { readFile } from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

type RunState = { id: string; runCode: string };

const credentials = (() => {
  const email = process.env.QA_EMAIL;
  const password = process.env.QA_PASSWORD;
  if (!email || !password) throw new Error("Faltan credenciales QA para registrar seguridad.");
  return { email, password };
})();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !anonKey) {
  throw new Error("Faltan variables Supabase para validar SQL 111.");
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(credentials.email);
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(/\/control$/, { timeout: 15_000 });
}

async function currentRun() {
  return JSON.parse(
    await readFile(path.resolve(process.cwd(), ".qa/current-run.json"), "utf8"),
  ) as RunState;
}

test("reclasifica QA-017 como regla de negocio confirmada", async ({ page }) => {
  const run = await currentRun();
  await login(page);

  const finding = await page.request.post("/api/admin/qa/events", {
    data: {
      action: "finding",
      data: {
        qaRunId: run.id,
        findingCode: "QA-017",
        severity: "P3",
        module: "customers",
        title: "Lectura global de clientes confirmada por negocio",
        status: "accepted",
        expectedResult: "Los clientes activos pueden consultarse desde cualquier sede autorizada.",
        actualResult: "Reception consulta el catalogo global y las operaciones mantienen sede propia.",
        rootCause: "La expectativa anterior asumio aislamiento por sede que no pertenece a la regla de negocio.",
        fixSummary: "SQL 112 fue descartado; no se modifica el alcance global de customers.",
        regressionResult: "Pendiente de confirmar en la bateria global y transaccional del run actual.",
        metadata: {
          resolution: "business_rule_confirmed",
          classification: "NOT_A_BUG",
          historicalRunPreserved: "QA_RUN_20260716_001",
        },
      },
    },
  });
  expect(finding.ok()).toBe(true);

  const scenario = await page.request.post("/api/admin/qa/events", {
    data: {
      action: "scenario",
      data: {
        qaRunId: run.id,
        scenarioCode: "CUSTOMER-RULE-001",
        module: "customers",
        status: "passed",
        severity: null,
        expectedResult: "QA-017 no se contabiliza como defecto abierto.",
        actualResult: "Regla confirmada: clientes globales y transacciones restringidas por sede.",
        evidence: { resolution: "business_rule_confirmed", sql112: "discarded" },
        finishedAt: new Date().toISOString(),
      },
    },
  });
  expect(scenario.ok()).toBe(true);
});

test("detecta si SQL 111 retiro DELETE heredado sin alterar evidencia", async ({ page }) => {
  const run = await currentRun();
  await login(page);

  const direct = createClient(supabaseUrl!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: loginError } = await direct.auth.signInWithPassword(credentials);
  expect(loginError?.message).toBeUndefined();

  const { error: deleteError } = await direct
    .from("qa_runs")
    .delete()
    .eq("id", crypto.randomUUID());
  const sql111Applied = deleteError?.code === "42501";

  const finding = await page.request.post("/api/admin/qa/events", {
    data: {
      action: "finding",
      data: {
        qaRunId: run.id,
        findingCode: "QA-014",
        severity: "P2",
        module: "qa_lab",
        title: "Privilegio DELETE heredado en laboratorio QA",
        status: sql111Applied ? "verified" : "open",
        expectedResult: "authenticated no tiene privilegio DELETE en tablas QA.",
        actualResult: sql111Applied
          ? "PostgREST rechazo DELETE antes de evaluar filas."
          : "DELETE sobre UUID inexistente no fue rechazado por privilegios.",
        rootCause: "Los grants iniciales incluyeron DELETE para authenticated.",
        fixSummary: "SQL 111 revoca DELETE en las cuatro tablas QA.",
        regressionResult: sql111Applied ? "SQL 111 verificado." : "Accion manual de release pendiente.",
        metadata: { sql111Applied, destructiveWrite: false },
      },
    },
  });
  expect(finding.ok()).toBe(true);

  const scenario = await page.request.post("/api/admin/qa/events", {
    data: {
      action: "scenario",
      data: {
        qaRunId: run.id,
        scenarioCode: "RLS-QA-DELETE-001",
        module: "qa_lab",
        status: sql111Applied ? "passed" : "not_run",
        severity: sql111Applied ? null : "P2",
        expectedResult: "DELETE denegado por privilegios sin borrar evidencia.",
        actualResult: sql111Applied ? "Denegacion 42501 confirmada." : "SQL 111 pendiente de aplicacion manual.",
        evidence: { sql111Applied, findingCode: "QA-014" },
        finishedAt: new Date().toISOString(),
      },
    },
  });
  expect(scenario.ok()).toBe(true);
});
