import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomInt } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

import { openFreshQaSession } from "./qa-pos-sessions";

import {
  installVisualCursor,
  showQaScenarioBanner,
  visualPause,
} from "./helpers/visual-cursor";

test.describe.configure({ mode: "serial" });

type Credentials = { email: string; password: string };
type RuntimeSecrets = { admin: Credentials; reception: Credentials };
type MasterState = {
  branches: { one: string; two: string };
  employees: { reception: string; barberOne: string; barberTwo: string };
  services: Record<string, string>;
};
type RunState = { id: string; runCode: string };

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ownerCredentials = {
  email: process.env.QA_EMAIL,
  password: process.env.QA_PASSWORD,
};

if (!url || !key || !ownerCredentials.email || !ownerCredentials.password) {
  throw new Error("Faltan variables Supabase o credenciales QA para clientes globales.");
}

const qaDirectory = path.resolve(process.cwd(), ".qa");
let owner: SupabaseClient;
let admin: SupabaseClient;
let reception: SupabaseClient;
let master: MasterState;
let run: RunState;
let customerId: string;
let reservationId: string;

function newClient() {
  return createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function login(credentials: Credentials) {
  const client = newClient();
  const { error } = await client.auth.signInWithPassword(credentials);
  expect(error?.message).toBeUndefined();
  return client;
}

async function loginPage(page: Page) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(ownerCredentials.email!);
  await page.getByLabel("Password").fill(ownerCredentials.password!);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(/\/control$/);
}

async function register(page: Page, table: string, id: string, scenario: string) {
  const response = await page.request.post("/api/admin/qa/events", {
    data: {
      action: "entity",
      data: {
        qaRunId: run.id,
        entityTable: table,
        entityId: id,
        entityType: "qa_global_customer_contract",
        scenarioCode: scenario,
        metadata: { globalCustomer: true },
      },
    },
  });
  expect(response.ok()).toBe(true);
}

test.beforeAll(async () => {
  const secrets = JSON.parse(
    await readFile(path.join(qaDirectory, "runtime-secrets.json"), "utf8"),
  ) as RuntimeSecrets;
  master = JSON.parse(
    await readFile(path.join(qaDirectory, "master-state.json"), "utf8"),
  ) as MasterState;
  run = JSON.parse(
    await readFile(path.join(qaDirectory, "current-run.json"), "utf8"),
  ) as RunState;

  owner = await login({ email: ownerCredentials.email!, password: ownerCredentials.password! });
  admin = await login(secrets.admin);
  reception = await login(secrets.reception);

  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 8);
  const phone = `97${randomInt(1_000_000, 9_999_999)}`;
  const { data, error } = await owner
    .from("customers")
    .insert({
      full_name: `QA_TEST_DATA Cliente Global ${run.runCode} ${suffix}`,
      first_name: "QA_TEST_DATA",
      last_name: `Global ${suffix}`,
      phone,
      phone_normalized: phone,
      source: "manual",
      is_active: true,
    })
    .select("id")
    .single();
  expect(error?.message).toBeUndefined();
  customerId = data!.id;

  const { error: reservationError } = await owner.from("reservations").insert({
    customer_id: customerId,
    branch_id: master.branches.two,
    status: "pending",
    source: "manual",
    channel: "reception",
  });
  expect(reservationError?.message).toBeUndefined();
});

test("clientes activos son globales para owner, admin y reception", async ({ page }) => {
  await installVisualCursor(page);
  await loginPage(page);
  await showQaScenarioBanner(page, {
    scenario: "CUSTOMER-GLOBAL-001",
    role: "owner/admin/reception",
    branch: "global",
    step: "Consultar el mismo cliente activo",
  });
  await page.goto("/control/clientes");
  await visualPause(page);

  for (const client of [owner, admin, reception]) {
    const { data, error } = await client.from("customers").select("id").eq("id", customerId).single();
    expect(error?.message).toBeUndefined();
    expect(data?.id).toBe(customerId);
  }

  await register(page, "customers", customerId, "CUSTOMER-GLOBAL-001");
});

test("el mismo cliente permanece visible al cambiar la sede QA de reception", async () => {
  const { error: moveError } = await owner
    .from("employees")
    .update({ branch_id: master.branches.two })
    .eq("id", master.employees.reception);
  expect(moveError?.message).toBeUndefined();

  try {
    const { data, error } = await reception.from("customers").select("id").eq("id", customerId).single();
    expect(error?.message).toBeUndefined();
    expect(data?.id).toBe(customerId);
  } finally {
    const { error } = await owner
      .from("employees")
      .update({ branch_id: master.branches.one })
      .eq("id", master.employees.reception);
    expect(error?.message).toBeUndefined();
  }
});

test("anon no consulta clientes", async () => {
  const anonymous = newClient();
  const { data, error } = await anonymous.from("customers").select("id").eq("id", customerId);
  if (error) {
    expect(error.code).toBe("42501");
  } else {
    expect(data).toEqual([]);
  }
});

test("barberos QA permanecen sin cuenta de acceso", async () => {
  const { data, error } = await owner
    .from("employees")
    .select("id, role, user_id, can_login")
    .in("id", [master.employees.barberOne, master.employees.barberTwo]);
  expect(error?.message).toBeUndefined();
  expect(data).toHaveLength(2);
  for (const employee of data ?? []) {
    expect(employee).toMatchObject({ role: "barber", user_id: null, can_login: false });
  }
});

test("reception no elimina clientes ni altera campos internos mediante API", async ({ page }) => {
  const secrets = JSON.parse(
    await readFile(path.join(qaDirectory, "runtime-secrets.json"), "utf8"),
  ) as RuntimeSecrets;
  await page.goto("/login");
  await page.getByLabel("Email").fill(secrets.reception.email);
  await page.getByLabel("Password").fill(secrets.reception.password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(/\/control$/);

  const deleteResponse = await page.request.delete(`/api/admin/customers/${customerId}`);
  expect([404, 405]).toContain(deleteResponse.status());

  const before = await reception.from("customers").select("source, is_active").eq("id", customerId).single();
  const detailResponse = await page.request.get("/api/admin/customers");
  expect(detailResponse.ok()).toBe(true);
  const customerList = (await detailResponse.json()) as { data: Array<{ id: string }> };
  expect(customerList.data.some((customer) => customer.id === customerId)).toBe(true);
  const updateResponse = await page.request.put(`/api/admin/customers/${customerId}`, {
    data: {
      document_type: null,
      first_name: "QA_TEST_DATA",
      last_name: "Global protegido",
      business_name: null,
      phone: `98${randomInt(1_000_000, 9_999_999)}`,
      source: "system",
      is_active: false,
    },
  });
  expect(updateResponse.ok()).toBe(true);

  const after = await reception.from("customers").select("source, is_active").eq("id", customerId).single();
  expect(after.data).toEqual(before.data);
});

test("reception usa el cliente global en reserva y POS de su sede", async ({ page }) => {
  test.setTimeout(90_000);
  const secrets = JSON.parse(
    await readFile(path.join(qaDirectory, "runtime-secrets.json"), "utf8"),
  ) as RuntimeSecrets;
  await page.goto("/login");
  await page.getByLabel("Email").fill(secrets.reception.email);
  await page.getByLabel("Password").fill(secrets.reception.password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(/\/control$/);

  const baseReservation = {
    customer_id: customerId,
    branch_id: master.branches.one,
    preferred_barber_id: master.employees.barberOne,
    service_interest_id: master.services["qa-servicio-100"],
    scheduled_date: new Date().toISOString().slice(0, 10),
    scheduled_time: "15:00",
    source: "manual",
    channel: "reception",
    customer_message: `${run.runCode} cliente global en sede activa`,
  };
  const createResponse = await page.request.post("/api/admin/reservations", {
    data: { ...baseReservation, status: "pending" },
  });
  expect(createResponse.ok()).toBe(true);
  reservationId = ((await createResponse.json()) as { data: { id: string } }).data.id;

  for (const status of ["contacted", "confirmed", "checked_in"]) {
    const response = await page.request.put(`/api/admin/reservations/${reservationId}`, {
      data: { ...baseReservation, status },
    });
    expect(response.ok()).toBe(true);
  }

  const session = await openFreshQaSession(page.request, master.branches.one, 100, run.runCode);

  const bootstrapResponse = await page.request.get(
    `/api/admin/pos/bootstrap?sessionId=${session.id}&reservationId=${reservationId}`,
  );
  expect(bootstrapResponse.ok()).toBe(true);
  const bootstrap = (await bootstrapResponse.json()) as {
    reservationPrefill: { customer: { id: string }; branchId: string } | null;
  };
  expect(bootstrap.reservationPrefill).toMatchObject({
    customer: { id: customerId },
    branchId: master.branches.one,
  });

  await loginPage(page);
  await register(page, "reservations", reservationId, "CUSTOMER-GLOBAL-POS-001");
});

test("cierra QA-018 despues de verificar el contrato global completo", async ({ page }) => {
  await loginPage(page);
  const harnessFinding = await page.request.post("/api/admin/qa/events", {
    data: {
      action: "finding",
      data: {
        qaRunId: run.id,
        findingCode: "QA-019",
        severity: "P2",
        module: "qa_harness",
        title: "El arnes no aceptaba denegacion explicita para anon",
        status: "verified",
        expectedResult: "Anon no recupera clientes mediante lista vacia o 42501.",
        actualResult: "Supabase revoca el grant y responde 42501.",
        rootCause: "La asercion solo contemplaba RLS silencioso.",
        fixSummary: "La prueba acepta los dos contratos seguros.",
        regressionResult: "Anon permanece sin datos y el escenario pasa.",
        metadata: { securityBehavior: "explicit_permission_denied" },
      },
    },
  });
  expect(harnessFinding.ok()).toBe(true);

  const finding = await page.request.post("/api/admin/qa/events", {
    data: {
      action: "finding",
      data: {
        qaRunId: run.id,
        findingCode: "QA-018",
        severity: "P1",
        module: "customers_rls",
        title: "RLS desplegado impedia lectura global de clientes para reception",
        status: "verified",
        expectedResult: "Reception consulta clientes globales y opera solo en su sede.",
        actualResult: "Lectura, detalle, edicion operativa, reserva y prellenado POS verificados.",
        rootCause: "Policies residuales de una version anterior del guard RLS.",
        fixSummary: "Rollback funcional del alcance global aplicado manualmente.",
        regressionResult: "Corrected and verified en owner, admin, reception y anon.",
        metadata: { resolution: "corrected_and_verified", reservationId },
      },
    },
  });
  expect(finding.ok()).toBe(true);

  const scenario = await page.request.post("/api/admin/qa/events", {
    data: {
      action: "scenario",
      data: {
        qaRunId: run.id,
        scenarioCode: "CUSTOMER-GLOBAL-001",
        module: "customers_rls",
        status: "passed",
        severity: null,
        expectedResult: "Clientes activos globales sin ampliar el alcance transaccional.",
        actualResult: "Contrato global verificado y operacion asociada a QA-SED-001.",
        evidence: { qa018: "corrected_and_verified" },
        finishedAt: new Date().toISOString(),
      },
    },
  });
  expect(scenario.ok()).toBe(true);
});
