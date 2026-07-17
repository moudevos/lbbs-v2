import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type APIResponse, type Page } from "@playwright/test";

const credentials = (() => {
  const email = process.env.QA_EMAIL;
  const password = process.env.QA_PASSWORD;
  if (!email || !password) throw new Error("Faltan credenciales QA para la iteracion 10.");
  return { email, password };
})();

async function readJson<T>(response: APIResponse): Promise<T> {
  const body = await response.text();
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(`La API QA devolvio una respuesta no JSON (${response.status()}).`);
  }
}

async function expectOk<T>(response: APIResponse) {
  const payload = await readJson<T & { error?: string }>(response);
  expect(response.ok(), payload.error ?? `La API respondio ${response.status()}.`).toBe(true);
  return payload;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(credentials.email);
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(/\/control$/, { timeout: 15_000 });
}

test("reutiliza el run preparado globalmente en la iteracion 11", async ({ page }) => {
  await login(page);
  const preparedRun = JSON.parse(await readFile(path.resolve(process.cwd(), ".qa", "current-run.json"), "utf8")) as { id: string; runCode: string };
  const requestedRunCode = preparedRun.runCode;

  const runRequest = {
    run_code: requestedRunCode,
    app_commit: process.env.QA_APP_COMMIT ?? null,
    app_branch: process.env.QA_APP_BRANCH ?? null,
    notes: "Bateria integral persistente del Sprint 9, iteracion 10.",
    metadata: {
      environment: "qa",
      baseUrl: "http://127.0.0.1:3100",
      runner: "playwright",
      visual: process.env.QA_VISUAL === "true",
    },
  };

  const firstResponse = await page.request.post("/api/admin/qa/runs", { data: runRequest });
  const first = await expectOk<{ data: { id: string; run_code: string; status: string } }>(firstResponse);
  expect(first.data.run_code).toMatch(/^QA_RUN_[0-9]{8}_[0-9]{3,}$/);
  if (requestedRunCode) {
    const requestedSequence = Number(requestedRunCode.split("_").at(-1));
    const actualSequence = Number(first.data.run_code.split("_").at(-1));
    expect(actualSequence).toBeGreaterThanOrEqual(requestedSequence);
  }
  expect(first.data.status).toBe("running");
  expect(first.data.id).toBe(preparedRun.id);

  const secondResponse = await page.request.post("/api/admin/qa/runs", { data: runRequest });
  const second = await expectOk<{ data: { id: string; run_code: string; status: string } }>(secondResponse);
  expect(second.data.id).toBe(first.data.id);

  const currentResponse = await page.request.get("/api/admin/qa/runs");
  const current = await expectOk<{ data: { id: string; run_code: string; status: string } }>(currentResponse);
  expect(current.data.status).toBe("running");
  expect(current.data).toMatchObject({ id: first.data.id, run_code: first.data.run_code });

  const entityResponse = await page.request.post("/api/admin/qa/events", {
    data: {
      action: "entity",
      data: {
        qaRunId: first.data.id,
        entityTable: "qa_runs",
        entityId: first.data.id,
        entityType: "qa_run",
        scenarioCode: "LAB-001",
        metadata: { runCode: first.data.run_code },
      },
    },
  });
  await expectOk(entityResponse);

  const scenarioResponse = await page.request.post("/api/admin/qa/events", {
    data: {
      action: "scenario",
      data: {
        qaRunId: first.data.id,
        scenarioCode: "LAB-001",
        module: "qa_lab",
        status: "passed",
        expectedResult: "SQL 110 accesible para owner y run idempotente.",
        actualResult: "Las tablas y vistas responden; dos solicitudes devolvieron el mismo run.",
        evidence: { runCode: first.data.run_code, idempotent: true },
        finishedAt: new Date().toISOString(),
      },
    },
  });
  await expectOk(scenarioResponse);

});
