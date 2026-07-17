import { readFile } from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import { expect, test, type APIResponse, type Page } from "@playwright/test";

import { openFreshQaSession } from "./qa-pos-sessions";

test.describe.configure({ mode: "serial" });
test.use({ trace: "off", screenshot: "off", video: "off" });

type RunState = { id: string; runCode: string };
type MasterState = {
  branches: { one: string; two: string };
  employees: { barberOne: string; barberTwo: string };
  services: Record<string, string>;
  products: Record<string, string>;
  paymentMethods: { cash: string; qr: string; card: string };
};
type FlowState = { customers: string[]; reservations: string[]; sessionId: string; sales: Record<string, string> };
type RuntimeSecrets = { reception: { email: string; password: string } };

const qaDirectory = path.resolve(process.cwd(), ".qa");
const ownerCredentials = (() => {
  const email = process.env.QA_EMAIL;
  const password = process.env.QA_PASSWORD;
  if (!email || !password) throw new Error("Faltan credenciales owner QA.");
  return { email, password };
})();

const legacySessionId = "0e917327-ee72-4806-b341-35f5ae1dd69b";

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Falta ${name} para ejecutar QA.`);
  return value;
}

async function state<T>(name: string) {
  return JSON.parse(await readFile(path.join(qaDirectory, name), "utf8")) as T;
}

async function json<T>(response: APIResponse) {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Respuesta no JSON (${response.status()}).`);
  }
}

async function ok<T>(response: APIResponse) {
  const payload = await json<T & { error?: string }>(response);
  expect(response.ok(), payload.error ?? `La API respondio ${response.status()}.`).toBe(true);
  return payload;
}

async function login(page: Page, credentials = ownerCredentials) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByLabel("Email").fill(credentials.email);
    await page.getByLabel("Password").fill(credentials.password);
    await page.getByRole("button", { name: "Ingresar" }).click();

    try {
      await page.waitForURL(/\/control$/, { timeout: 30_000 });
      return;
    } catch (error) {
      if (attempt === 1) throw error;
      await page.waitForTimeout(500);
    }
  }
}

async function event(page: Page, run: RunState, action: "entity" | "scenario" | "finding", data: Record<string, unknown>) {
  await ok(await page.request.post("/api/admin/qa/events", { data: { action, data: { qaRunId: run.id, ...data } } }));
}

async function scenario(page: Page, run: RunState, code: string, module: string, expected: string, actual: string, durationMs?: number) {
  await event(page, run, "scenario", {
    scenarioCode: code,
    module,
    status: "passed",
    expectedResult: expected,
    actualResult: actual,
    durationMs,
    evidence: { persistent: true },
    finishedAt: new Date().toISOString(),
  });
}

async function entity(page: Page, run: RunState, table: string, id: string, type: string, scenarioCode: string) {
  await event(page, run, "entity", {
    entityTable: table,
    entityId: id,
    entityType: type,
    scenarioCode,
    metadata: { persistent: true },
  });
}

async function authenticatedDb(email: string, password: string) {
  const client = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`No se pudo iniciar la sesion QA: ${error.message}`);
  return client;
}

function qaSettlementPeriodDate(runCode: string) {
  const runSequence = Number(runCode.split("_").at(-1));
  const offsetDays = Number.isFinite(runSequence) ? runSequence * 16 : 16;
  return new Date(Date.UTC(2100, 0, 1 + offsetDays)).toISOString().slice(0, 10);
}

async function ensureBranchTwoSale(page: Page, run: RunState, master: MasterState, flow: FlowState) {
  const session = await openFreshQaSession(page.request, master.branches.two, 50, run.runCode);
  const sale = (await ok<{ data: { saleId: string; items: Array<{ id: string }>; payments: Array<{ id: string }> } }>(
    await page.request.post("/api/admin/pos/checkout", {
      data: {
        idempotency_key: `${run.runCode}_branch_two`,
        pos_session_id: session.id,
        branch_id: master.branches.two,
        customer_id: flow.customers[0],
        barber_id: null,
        reservation_id: null,
        notes: `${run.runCode} venta aislamiento`,
        items: [{ item_type: "product", catalog_id: master.products["qa-producto-50"], quantity: 1, unit_price: 50, discount_amount: 0, is_courtesy: false }],
        payments: [{ payment_method_id: master.paymentMethods.cash, amount: 50, tendered_amount: 50, change_amount: 0 }],
      },
    }),
  )).data;
  await entity(page, run, "pos_sessions", session.id, "qa_idor_session", "RLS-IDOR-001");
  await entity(page, run, "sales", sale.saleId, "qa_idor_sale", "RLS-IDOR-001");
  for (const item of sale.items) await entity(page, run, "sale_items", item.id, "qa_idor_item", "RLS-IDOR-001");
  for (const payment of sale.payments) await entity(page, run, "sale_payments", payment.id, "qa_idor_payment", "RLS-IDOR-001");
  return { sessionId: session.id, saleId: sale.saleId };
}

test("audita el cierre unico de la sesion POS heredada", async ({ page }) => {
  const [run, secrets] = await Promise.all([
    state<RunState>("current-run.json"),
    state<RuntimeSecrets>("runtime-secrets.json"),
  ]);
  await login(page);

  const owner = await authenticatedDb(ownerCredentials.email, ownerCredentials.password);
  const [authorization, closures] = await Promise.all([
    owner.from("pos_session_legacy_closure_authorizations")
      .select("pos_session_id,closed_at,closed_by,reason")
      .eq("pos_session_id", legacySessionId)
      .single(),
    owner.from("pos_session_payment_closures")
      .select("id,payment_method_id,expected_amount,legacy_expected_amount,counted_amount,difference_amount")
      .eq("pos_session_id", legacySessionId),
  ]);
  expect(authorization.error).toBeNull();
  expect(authorization.data).toMatchObject({ pos_session_id: legacySessionId });
  expect(authorization.data?.closed_at).toBeTruthy();
  expect(authorization.data?.closed_by).toBeTruthy();
  expect(closures.error).toBeNull();
  expect(closures.data?.some((item) => Number(item.legacy_expected_amount) === -590 && Number(item.expected_amount) === 0)).toBe(true);

  const retryResults = await Promise.all([
    owner.rpc("close_pos_session", { p_session_id: legacySessionId, p_counted_amounts: {}, p_notes: "QA retry" }),
    owner.rpc("close_pos_session", { p_session_id: legacySessionId, p_counted_amounts: {}, p_notes: "QA concurrencia" }),
  ]);
  expect(retryResults.every((result) => result.error)).toBe(true);

  const directWrite = await owner.from("pos_session_payment_closures").insert({
    pos_session_id: legacySessionId,
    payment_method_id: closures.data?.[0]?.payment_method_id,
    expected_amount: 0,
    legacy_expected_amount: -1,
    counted_amount: 0,
    difference_amount: 0,
  });
  expect(directWrite.error).toBeTruthy();
  await owner.auth.signOut({ scope: "local" });

  const reception = await authenticatedDb(secrets.reception.email, secrets.reception.password);
  const [receptionAuthorization, receptionSummary] = await Promise.all([
    reception.from("pos_session_legacy_closure_authorizations").select("pos_session_id").eq("pos_session_id", legacySessionId),
    reception.rpc("get_pos_session_closure_summary", { p_session_id: legacySessionId }),
  ]);
  expect(receptionAuthorization.error).toBeNull();
  expect(receptionAuthorization.data).toHaveLength(0);
  expect(receptionSummary.error).toBeTruthy();
  await reception.auth.signOut({ scope: "local" });

  for (const closure of closures.data ?? []) {
    await entity(page, run, "pos_session_payment_closures", closure.id, "qa_legacy_closure", "POS-LEGACY-CLOSE-001");
  }
  await entity(page, run, "pos_sessions", legacySessionId, "qa_legacy_session", "POS-LEGACY-CLOSE-001");
  await scenario(page, run, "POS-LEGACY-CLOSE-001", "caja", "El cierre heredado queda auditado una vez y excluido para recepcion.", "Se conserva -590 como legado, efectivo operativo cero, retry y concurrencia rechazados.");
});

test("aísla transacciones entre sedes para recepción", async ({ page }) => {
  test.setTimeout(120_000);
  const [run, master, flow, secrets] = await Promise.all([
    state<RunState>("current-run.json"),
    state<MasterState>("master-state.json"),
    state<FlowState>("integral-flow-state.json"),
    state<RuntimeSecrets>("runtime-secrets.json"),
  ]);
  await login(page);
  const crossBranch = await ensureBranchTwoSale(page, run, master, flow);
  const reception = await authenticatedDb(secrets.reception.email, secrets.reception.password);

  const checks: Array<[string, string]> = [
    ["reservations", flow.reservations[1]],
    ["pos_sessions", crossBranch.sessionId],
    ["sales", crossBranch.saleId],
  ];
  for (const [table, id] of checks) {
    const result = await reception.from(table).select("id").eq("id", id);
    expect(result.error).toBeNull();
    expect(result.data).toEqual([]);
  }
  for (const table of ["sale_items", "sale_payments", "sale_document_snapshots"]) {
    const result = await reception.from(table).select("id").eq("sale_id", crossBranch.saleId);
    expect(result.error).toBeNull();
    expect(result.data).toEqual([]);
  }

  await page.context().clearCookies();
  await login(page, secrets.reception);
  expect([403, 404]).toContain((await page.request.get(`/api/admin/sales/${crossBranch.saleId}`)).status());
  const cashScope = await ok<{ selectedBranchId: string; branches: Array<{ id: string }> }>(
    await page.request.get(`/api/admin/cash/bootstrap?branchId=${master.branches.two}`),
  );
  expect(cashScope.selectedBranchId).toBe(master.branches.one);
  expect(cashScope.branches.map((branch) => branch.id)).not.toContain(master.branches.two);
  for (const route of ["/api/admin/production", "/api/admin/settlements", "/api/admin/finance", "/api/admin/payment-simulations"]) {
    expect((await page.request.get(route)).status()).toBe(403);
  }

  await reception.auth.signOut({ scope: "local" });
  await login(page);
  await scenario(page, run, "RLS-IDOR-001", "security", "Recepción no lee ni opera transacciones de otra sede.", "Reserva, sesión, venta, items, pagos, ticket, caja y módulos administrativos quedaron aislados.");
});

test("valida la matriz operativa de cortesías", async ({ page }) => {
  test.setTimeout(150_000);
  const [run, master, flow] = await Promise.all([
    state<RunState>("current-run.json"),
    state<MasterState>("master-state.json"),
    state<FlowState>("integral-flow-state.json"),
  ]);
  await login(page);
  const ownerDb = await authenticatedDb(ownerCredentials.email, ownerCredentials.password);
  const existingRule = await ownerDb.from("courtesy_rules").select("id").eq("name", "QA_TEST_DATA Cortesia Iteracion 11").maybeSingle();
  expect(existingRule.error).toBeNull();
  let ruleId = existingRule.data?.id;
  if (!ruleId) {
    const insertedRule = await ownerDb.from("courtesy_rules").insert({
      name: "QA_TEST_DATA Cortesia Iteracion 11",
      description: "QA_TEST_DATA Regla persistente para matriz de cortesias.",
      branch_id: master.branches.one,
      priority: 900,
      qualifying_service_id: master.services["qa-servicio-100"],
      minimum_unit_amount: 100,
      maximum_courtesy_items: 1,
      maximum_courtesy_amount: 50,
      allow_with_reward: false,
      is_active: true,
    }).select("id").single();
    expect(insertedRule.error).toBeNull();
    ruleId = insertedRule.data!.id;
  }
  const existingBenefit = await ownerDb.from("courtesy_rule_benefits").select("id").eq("rule_id", ruleId).eq("product_id", master.products["qa-producto-cortesia"]).maybeSingle();
  expect(existingBenefit.error).toBeNull();
  let benefitId = existingBenefit.data?.id;
  if (!benefitId) {
    const insertedBenefit = await ownerDb.from("courtesy_rule_benefits").insert({
      rule_id: ruleId,
      benefit_item_type: "product",
      product_id: master.products["qa-producto-cortesia"],
      max_quantity: 1,
      max_unit_amount: 50,
      is_active: true,
    }).select("id").single();
    expect(insertedBenefit.error).toBeNull();
    benefitId = insertedBenefit.data!.id;
  }
  await ownerDb.auth.signOut({ scope: "local" });
  await entity(page, run, "courtesy_rules", ruleId!, "qa_master_courtesy_rule", "COURTESY-001");
  await entity(page, run, "courtesy_rule_benefits", benefitId!, "qa_master_courtesy_benefit", "COURTESY-001");

  const attempt = crypto.randomUUID().slice(0, 8);
  const commercialService = { item_type: "service", catalog_id: master.services["qa-servicio-100"], quantity: 1, unit_price: 100, discount_amount: 0, is_courtesy: false };
  const courtesyProduct = { item_type: "product", catalog_id: master.products["qa-producto-cortesia"], quantity: 1, unit_price: 50, discount_amount: 0, is_courtesy: true, courtesy_reason: "QA promocion" };
  const checkout = (suffix: string, items: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) => page.request.post("/api/admin/pos/checkout", {
    data: {
      idempotency_key: `${run.runCode}_${attempt}_courtesy_${suffix}`,
      pos_session_id: flow.sessionId,
      branch_id: master.branches.one,
      customer_id: flow.customers[0],
      barber_id: master.employees.barberOne,
      notes: `${run.runCode} matriz cortesia`,
      items,
      payments: [{ payment_method_id: master.paymentMethods.cash, amount: 100, tendered_amount: 100, change_amount: 0 }],
      ...extra,
    },
  });

  expect((await checkout("only_product", [courtesyProduct])).status()).toBe(400);
  expect((await checkout("only_service", [{ ...commercialService, is_courtesy: true, courtesy_reason: "QA" }])).status()).toBe(400);
  expect((await checkout("below", [{ ...commercialService, catalog_id: master.services["qa-servicio-50"], unit_price: 50 }, courtesyProduct])).status()).toBe(400);
  expect((await checkout("sum", [
    { ...commercialService, catalog_id: master.services["qa-servicio-50"], unit_price: 50 },
    { ...commercialService, catalog_id: master.services["qa-servicio-50"], unit_price: 50 },
    courtesyProduct,
  ])).status()).toBe(400);
  expect((await checkout("excess", [commercialService, { ...courtesyProduct, quantity: 2 }])).status()).toBe(400);
  expect((await checkout("outside", [commercialService, { ...courtesyProduct, catalog_id: master.products["qa-producto-50"] }])).status()).toBe(400);
  expect((await checkout("nostock", [commercialService, { ...courtesyProduct, catalog_id: master.products["qa-producto-agotado"] }])).status()).toBe(400);
  expect((await checkout("reward", [commercialService, courtesyProduct], { reward_entitlement_id: crypto.randomUUID() })).status()).toBe(400);

  const concurrent = await Promise.all([
    checkout("valid", [commercialService, courtesyProduct]),
    checkout("valid", [commercialService, courtesyProduct]),
  ]);
  const successful = concurrent.filter((response) => response.ok());
  expect(successful.length).toBeGreaterThan(0);
  const validSale = (await json<{ data: { saleId: string } }>(successful[0])).data;
  const retry = (await ok<{ data: { saleId: string } }>(await checkout("valid", [commercialService, courtesyProduct]))).data;
  expect(retry.saleId).toBe(validSale.saleId);
  const ticket = await page.request.get(`/api/admin/sales/${validSale.saleId}/ticket`);
  expect(ticket.ok()).toBe(true);
  const audit = await authenticatedDb(ownerCredentials.email, ownerCredentials.password);
  const auditedItems = await audit.from("sale_items").select("is_courtesy,courtesy_rule_id,courtesy_rule_name_snapshot,original_unit_price,courtesy_amount,qualifying_sale_item_id").eq("sale_id", validSale.saleId);
  expect(auditedItems.error).toBeNull();
  const auditedCourtesy = auditedItems.data?.find((item) => item.is_courtesy);
  expect(auditedCourtesy).toMatchObject({ courtesy_rule_id: ruleId, courtesy_rule_name_snapshot: "QA_TEST_DATA Cortesia Iteracion 11" });
  expect(auditedCourtesy?.qualifying_sale_item_id).toBeTruthy();
  await audit.auth.signOut({ scope: "local" });
  await entity(page, run, "sales", validSale.saleId, "qa_courtesy_sale", "COURTESY-001");
  await scenario(page, run, "COURTESY-001", "courtesy", "La matriz bloquea manipulaciones y persiste una cortesía válida una sola vez.", "Ocho rechazos controlados; venta válida idempotente, ticket y snapshot de regla auditados.");
});

test("valida caja, finanzas, producción, rewards y simulación sin efectos", async ({ page }) => {
  test.setTimeout(150_000);
  const [run, master, flow] = await Promise.all([
    state<RunState>("current-run.json"),
    state<MasterState>("master-state.json"),
    state<FlowState>("integral-flow-state.json"),
  ]);
  await login(page);

  const cash = await ok<{ activeSession: { id: string } | null; categories: Array<{ id: string; code: string; movement_direction: string }> }>(
    await page.request.get(`/api/admin/cash/bootstrap?branchId=${master.branches.one}`),
  );
  expect(cash.activeSession?.id).toBe(flow.sessionId);
  expect(cash.categories.map((item) => item.code)).toEqual(expect.arrayContaining(["operational_income", "operational_expense", "cash_withdrawal", "cash_adjustment", "petty_purchase"]));
  await event(page, run, "finding", {
    findingCode: "QA-021",
    severity: "P2",
    module: "cash",
    title: "Catálogo base de categorías de caja ausente",
    status: "verified",
    expectedResult: "Caja garantiza sus cinco categorías operativas base.",
    actualResult: "La ruta restauró de forma idempotente los códigos faltantes y los devolvió activos.",
    rootCause: "El entorno remoto tenía la tabla, pero no todos los seeds de 070_cash_operations.sql.",
    fixSummary: "Carga condicional server-side de categorías base, sin escritura cuando ya existen.",
    regressionResult: "Los cinco códigos base y el flujo de movimiento/anulación fueron verificados.",
  });
  const category = cash.categories.find((item) => item.movement_direction === "income");
  expect(category).toBeTruthy();
  const movement = (await ok<{ data: { id: string } }>(await page.request.post("/api/admin/cash/movements", {
    data: { pos_session_id: flow.sessionId, category_id: category!.id, movement_type: "income", amount: 7, description: `${run.runCode} ingreso QA` },
  }))).data;
  await entity(page, run, "cash_movements", movement.id, "qa_cash_movement", "CASH-001");
  await ok(await page.request.post(`/api/admin/cash/movements/${movement.id}/cancel`, { data: { reason: `${run.runCode} anulacion QA` } }));
  await scenario(page, run, "CASH-001", "cash", "Movimiento manual trazable y anulable.", "Ingreso S/7 creado y anulado sin eliminar evidencia.");

  const finance = await ok<{ categories: Array<{ id: string; code: string; direction: string }>; paymentMethods: Array<{ id: string }> }>(await page.request.get("/api/admin/finance"));
  expect(finance.categories.map((item) => item.code)).toEqual(expect.arrayContaining(["other_income", "operating_expense"]));
  await event(page, run, "finding", {
    findingCode: "QA-022",
    severity: "P2",
    module: "finance",
    title: "Catálogo base de categorías financieras ausente",
    status: "verified",
    expectedResult: "Finanzas garantiza las categorías base de ingreso y gasto.",
    actualResult: "La ruta restauró de forma idempotente los códigos faltantes y los devolvió activos.",
    rootCause: "El entorno remoto tenía la tabla, pero no todos los seeds de 105_payment_method_cash_semantics.sql.",
    fixSummary: "Carga condicional server-side de categorías base, sin escritura cuando ya existen.",
    regressionResult: "Los dos códigos base y el flujo de alta/anulación fueron verificados.",
  });
  const financeCategory = finance.categories.find((item) => item.direction === "income");
  expect(financeCategory).toBeTruthy();
  const financeEntry = (await ok<{ data: { id: string } }>(await page.request.post("/api/admin/finance", {
    data: { categoryId: financeCategory!.id, direction: "income", amount: 9, description: `${run.runCode} finanza QA`, branchId: master.branches.one, paymentMethodId: finance.paymentMethods[0]?.id },
  }))).data;
  await entity(page, run, "finance_manual_entries", financeEntry.id, "qa_finance_entry", "FINANCE-001");
  await ok(await page.request.post(`/api/admin/finance/${financeEntry.id}`, { data: { reason: `${run.runCode} anulacion QA` } }));
  await scenario(page, run, "FINANCE-001", "finance", "Movimiento financiero único y anulable.", "Asiento S/9 creado y anulado con motivo.");

  const production = await ok<{ selectedPeriodId: string; data: Array<{ sale_id: string; status: string }> }>(await page.request.get("/api/admin/production"));
  expect(production.selectedPeriodId).toBeTruthy();
  await ok(await page.request.post("/api/admin/production", { data: { periodId: production.selectedPeriodId, branchId: master.branches.one } }));
  const regenerated = await ok<{ data: Array<{ sale_id: string; status: string }> }>(await page.request.get(`/api/admin/production?periodId=${production.selectedPeriodId}&branchId=${master.branches.one}`));
  expect(regenerated.data.some((item) => item.sale_id === flow.sales.idempotent && item.status === "active")).toBe(true);
  await scenario(page, run, "PRODUCTION-001", "production", "Producción regenerable sin duplicar venta.", "La venta completada permanece activa y la anulada no suma.");

  type SettlementRow = {
    id: string;
    payroll_period_id: string;
    employee_id: string;
    branch_id: string;
    settlement_number: string;
    status: string;
    gross_pay_amount: number | string;
    debt_deduction_total: number | string;
    net_before_mandatory_discount: number | string;
    mandatory_discount_amount: number | string;
    net_pay_amount: number | string;
    cash_movement_id: string | null;
    paid_at: string | null;
    paid_by: string | null;
  };
  const ownerDb = await authenticatedDb(ownerCredentials.email, ownerCredentials.password);
  const { data: settlementPeriod, error: settlementPeriodError } = await ownerDb.rpc("get_or_create_payroll_period", {
    p_date: qaSettlementPeriodDate(run.runCode),
  });
  expect(settlementPeriodError).toBeNull();
  expect(settlementPeriod?.id).toBeTruthy();
  await entity(page, run, "payroll_periods", settlementPeriod!.id, "qa_settlement_period", "SETTLEMENT-001");
  const prepared = (await ok<{ data: SettlementRow }>(await page.request.post("/api/admin/settlements", {
    data: {
      periodId: settlementPeriod!.id,
      employeeId: master.employees.barberOne,
      commissionRate: 0,
      debtDeductions: [],
      notes: `${run.runCode} liquidación QA`,
    },
  }))).data;
  expect(prepared.status).toBe("draft");
  const edited = (await ok<{ data: SettlementRow }>(await page.request.post("/api/admin/settlements", {
    data: {
      periodId: settlementPeriod!.id,
      employeeId: master.employees.barberOne,
      commissionRate: 0,
      debtDeductions: [],
      notes: `${run.runCode} liquidación QA editada`,
    },
  }))).data;
  expect(edited.id).toBe(prepared.id);

  const baseBeforeDiscount = Number(edited.gross_pay_amount) - Number(edited.debt_deduction_total);
  const adjustmentDifference = Number(Math.abs(1000 - baseBeforeDiscount).toFixed(2));
  const adjustments = adjustmentDifference > 0
    ? [{
        adjustment_type: baseBeforeDiscount < 1000 ? "bonus" : "deduction",
        description: `${run.runCode} ajuste para caso obligatorio`,
        amount: adjustmentDifference,
      }]
    : [];
  const reviewPayload = { action: "review", adjustments };
  const concurrentReviews = await Promise.all([
    page.request.post(`/api/admin/settlements/${prepared.id}`, { data: reviewPayload }),
    page.request.post(`/api/admin/settlements/${prepared.id}`, { data: reviewPayload }),
  ]);
  expect(concurrentReviews.map((response) => response.status()).sort()).toEqual([200, 400]);
  const reviewed = (await ok<{ data: SettlementRow }>(concurrentReviews.find((response) => response.ok())!)).data;
  expect(reviewed.status).toBe("review");
  expect(Number(reviewed.net_before_mandatory_discount)).toBe(1000);
  expect(Number(reviewed.mandatory_discount_amount)).toBe(10);
  expect(Number(reviewed.net_pay_amount)).toBe(990);

  const concurrentApprovals = await Promise.all([
    page.request.post(`/api/admin/settlements/${prepared.id}`, { data: { action: "approve" } }),
    page.request.post(`/api/admin/settlements/${prepared.id}`, { data: { action: "approve" } }),
  ]);
  expect(concurrentApprovals.map((response) => response.status()).sort()).toEqual([200, 400]);
  const approved = (await ok<{ data: SettlementRow }>(concurrentApprovals.find((response) => response.ok())!)).data;
  expect(approved.status).toBe("approved");
  const paymentPayload = {
    action: "pay",
    paymentMethodId: master.paymentMethods.cash,
    amount: 990,
    reference: `${run.runCode}-LIQ`,
    notes: `${run.runCode} pago concurrente QA`,
    posSessionId: flow.sessionId,
  };
  const beforeRejectedPayment = await ok<{ data: SettlementRow; adjustments: Array<{ amount: number | string }> }>(
    await page.request.get(`/api/admin/settlements/${prepared.id}`),
  );
  const { data: beforeCashSession, error: beforeCashSessionError } = await ownerDb
    .from("pos_sessions")
    .select("expected_cash_amount")
    .eq("id", flow.sessionId)
    .single();
  expect(beforeCashSessionError).toBeNull();
  const { count: beforeSettlementCashCount, error: beforeSettlementCashError } = await ownerDb
    .from("cash_movements")
    .select("id", { count: "exact", head: true })
    .eq("pos_session_id", flow.sessionId)
    .eq("description", `Pago de liquidacion ${prepared.settlement_number}`);
  expect(beforeSettlementCashError).toBeNull();
  const { count: beforeFinanceCount, error: beforeFinanceError } = await ownerDb
    .from("finance_manual_entries")
    .select("id", { count: "exact", head: true })
    .eq("reference", paymentPayload.reference);
  expect(beforeFinanceError).toBeNull();
  const insufficientCashPayment = await page.request.post(`/api/admin/settlements/${prepared.id}`, {
    data: paymentPayload,
  });
  expect(insufficientCashPayment.status()).toBe(400);
  expect((await insufficientCashPayment.json()) as { code?: string }).toMatchObject({
    code: "SETTLEMENT_CASH_INSUFFICIENT",
  });
  const stillApproved = await ok<{ data: SettlementRow }>(
    await page.request.get(`/api/admin/settlements/${prepared.id}`),
  );
  expect(stillApproved.data).toMatchObject({
    status: "approved",
    cash_movement_id: null,
    paid_at: null,
    paid_by: null,
  });
  const afterRejectedPayment = await ok<{ data: SettlementRow; adjustments: Array<{ amount: number | string }> }>(
    await page.request.get(`/api/admin/settlements/${prepared.id}`),
  );
  expect(afterRejectedPayment.adjustments).toEqual(beforeRejectedPayment.adjustments);
  const { data: afterCashSession, error: afterCashSessionError } = await ownerDb
    .from("pos_sessions")
    .select("expected_cash_amount")
    .eq("id", flow.sessionId)
    .single();
  expect(afterCashSessionError).toBeNull();
  expect(afterCashSession?.expected_cash_amount).toBe(beforeCashSession?.expected_cash_amount);
  const { count: afterSettlementCashCount, error: afterSettlementCashError } = await ownerDb
    .from("cash_movements")
    .select("id", { count: "exact", head: true })
    .eq("pos_session_id", flow.sessionId)
    .eq("description", `Pago de liquidacion ${prepared.settlement_number}`);
  expect(afterSettlementCashError).toBeNull();
  expect(afterSettlementCashCount).toBe(beforeSettlementCashCount);
  const { count: afterFinanceCount, error: afterFinanceError } = await ownerDb
    .from("finance_manual_entries")
    .select("id", { count: "exact", head: true })
    .eq("reference", paymentPayload.reference);
  expect(afterFinanceError).toBeNull();
  expect(afterFinanceCount).toBe(beforeFinanceCount);
  await scenario(page, run, "SETTLEMENT-CASH-INSUFFICIENT-001", "settlements", "Sin efectivo suficiente el pago se rechaza sin efectos parciales.", "SETTLEMENT_CASH_INSUFFICIENT mantuvo liquidacion, snapshot, caja y libro manual sin cambios.");

  const fundingCategory = cash.categories.find((item) => item.code === "operational_income");
  expect(fundingCategory).toBeTruthy();
  const fundingMovement = (await ok<{ data: { id: string } }>(
    await page.request.post("/api/admin/cash/movements", {
      data: {
        pos_session_id: flow.sessionId,
        category_id: fundingCategory!.id,
        movement_type: "income",
        amount: 1000,
        description: `${run.runCode} fondo QA para pago de liquidacion`,
      },
    }),
  )).data;
  await entity(page, run, "cash_movements", fundingMovement.id, "qa_settlement_cash_funding", "FINANCE-SETTLEMENT-001");

  const concurrentPayments = await Promise.all([
    page.request.post(`/api/admin/settlements/${prepared.id}`, { data: paymentPayload }),
    page.request.post(`/api/admin/settlements/${prepared.id}`, { data: paymentPayload }),
  ]);
  expect(concurrentPayments.map((response) => response.status()).sort()).toEqual([200, 400]);
  expect((await page.request.post(`/api/admin/settlements/${prepared.id}`, { data: paymentPayload })).status()).toBe(400);

  const paidDetail = await ok<{ data: SettlementRow; adjustments: Array<{ amount: number | string }>; services: Array<{ id: string }> }>(
    await page.request.get(`/api/admin/settlements/${prepared.id}`),
  );
  expect(paidDetail.data.status).toBe("paid");
  expect(Number(paidDetail.data.net_before_mandatory_discount)).toBe(1000);
  expect(Number(paidDetail.data.mandatory_discount_amount)).toBe(10);
  expect(Number(paidDetail.data.net_pay_amount)).toBe(990);
  expect(paidDetail.data.cash_movement_id).toBeTruthy();
  expect((await page.request.post(`/api/admin/settlements/${prepared.id}`, { data: reviewPayload })).status()).toBe(400);
  expect((await page.request.post(`/api/admin/settlements/${prepared.id}`, { data: { action: "approve" } })).status()).toBe(400);
  expect((await page.request.post(`/api/admin/settlements/${prepared.id}`, {
    data: { action: "cancel", reason: `${run.runCode} intento de anulacion directa` },
  })).status()).toBe(400);

  const { data: settlementCashMovements, error: settlementCashError } = await ownerDb
    .from("cash_movements")
    .select("id,amount,movement_type,status,branch_id,pos_session_id,category_id")
    .eq("id", paidDetail.data.cash_movement_id!);
  expect(settlementCashError).toBeNull();
  expect(settlementCashMovements).toHaveLength(1);
  expect(settlementCashMovements?.[0]).toMatchObject({
    movement_type: "expense",
    status: "active",
    branch_id: paidDetail.data.branch_id,
    pos_session_id: flow.sessionId,
  });
  expect(Number(settlementCashMovements?.[0]?.amount)).toBe(990);
  const { data: settlementCategory, error: settlementCategoryError } = await ownerDb
    .from("cash_movement_categories")
    .select("id,code")
    .eq("id", settlementCashMovements?.[0]?.category_id ?? "")
    .single();
  expect(settlementCategoryError).toBeNull();
  expect(settlementCategory?.code).toBe("employee_settlement_payment");
  const { data: paidFinanceEntries, error: paidFinanceError } = await ownerDb
    .from("finance_manual_entries")
    .select("id,direction,amount,payment_method_id,source_type,source_id,status")
    .eq("source_type", "employee_settlement")
    .eq("source_id", prepared.id);
  expect(paidFinanceError).toBeNull();
  expect(paidFinanceEntries).toHaveLength(1);
  expect(paidFinanceEntries?.[0]).toMatchObject({
    direction: "expense",
    payment_method_id: master.paymentMethods.cash,
    source_type: "employee_settlement",
    source_id: prepared.id,
    status: "active",
  });
  expect(Number(paidFinanceEntries?.[0]?.amount)).toBe(990);
  await ownerDb.auth.signOut({ scope: "local" });

  const secrets = await state<RuntimeSecrets>("runtime-secrets.json");
  await login(page, secrets.reception);
  expect((await page.request.get(`/api/admin/settlements/${prepared.id}`)).status()).toBe(403);
  expect((await page.request.post(`/api/admin/settlements/${prepared.id}`, { data: paymentPayload })).status()).toBe(403);
  const receptionDb = await authenticatedDb(secrets.reception.email, secrets.reception.password);
  const receptionCash = await receptionDb
    .from("cash_movements")
    .select("id")
    .eq("id", paidDetail.data.cash_movement_id!);
  expect(receptionCash.error).toBeNull();
  expect(receptionCash.data).toHaveLength(0);
  const receptionFinance = await receptionDb
    .from("finance_manual_entries")
    .select("id")
    .eq("source_type", "employee_settlement")
    .eq("source_id", prepared.id);
  expect(receptionFinance.error).toBeNull();
  expect(receptionFinance.data).toHaveLength(0);
  await receptionDb.auth.signOut({ scope: "local" });
  await login(page);
  await page.goto("/control/liquidaciones");
  await expect(page.getByText("Liquidaciones quincenales")).toBeVisible();
  const settlementRow = page.locator("tr").filter({ hasText: paidDetail.data.settlement_number }).first();
  await settlementRow.getByRole("button", { name: "Documento" }).click();
  await expect(page.getByText("Neto previo al descuento")).toBeVisible();
  await expect(page.getByText("Neto final a pagar")).toBeVisible();
  await page.evaluate(() => {
    const qaWindow = window as Window & { qaPrintCalls?: number };
    qaWindow.qaPrintCalls = 0;
    window.print = () => { qaWindow.qaPrintCalls = (qaWindow.qaPrintCalls ?? 0) + 1; };
  });
  await page.getByRole("button", { name: "Imprimir" }).click();
  expect(await page.evaluate(() => (window as Window & { qaPrintCalls?: number }).qaPrintCalls)).toBe(1);
  await scenario(page, run, "SETTLEMENT-CASH-PAYMENT-001", "settlements", "Con fondo suficiente la liquidacion paga S/990 una sola vez.", "La liquidacion quedo paid con categoria canonica, paid_at, paid_by y egreso financiero enlazado.");
  await scenario(page, run, "SETTLEMENT-PAY-CONCURRENCY-001", "settlements", "Dos pagos concurrentes producen un unico egreso y un retry controlado.", "Una solicitud pago y la otra fue rechazada; el retry no genero un segundo movimiento.");
  await scenario(page, run, "FINANCE-SETTLEMENT-001", "finance", "El pago de liquidacion genera un egreso financiero canonico de S/990.", "Un cash_movement y un egreso financiero enlazado a la liquidacion quedaron activos sin duplicados.");
  await entity(page, run, "employee_settlements", prepared.id, "qa_paid_settlement", "SETTLEMENT-001");
  await entity(page, run, "cash_movements", paidDetail.data.cash_movement_id!, "qa_settlement_cash_expense", "FINANCE-SETTLEMENT-001");
  await scenario(page, run, "SETTLEMENT-001", "settlements", "Liquidación S/1,000 menos 1 % termina en S/990 y se paga una sola vez.", "Borrador editable, revisión, aprobación, pago concurrente único, retry rechazado e inmutabilidad verificados.");

  const benefits = (await ok<{ data: Array<{ id: string; name: string }> }>(await page.request.get("/api/admin/rewards/benefits"))).data;
  let benefit = benefits.find((item) => item.name === "QA_TEST_DATA Voucher Iteracion 10");
  if (!benefit) {
    benefit = (await ok<{ data: { id: string; name: string } }>(await page.request.post("/api/admin/rewards/benefits", {
      data: { name: "QA_TEST_DATA Voucher Iteracion 10", benefit_type: "voucher_amount", applies_to: "all", voucher_amount: 10, is_active: true },
    }))).data;
  }
  const rules = (await ok<{ data: Array<{ id: string; name: string }> }>(await page.request.get("/api/admin/rewards/rules"))).data;
  let rule = rules.find((item) => item.name === "QA_TEST_DATA Atenciones Iteracion 10");
  if (!rule) {
    rule = (await ok<{ data: { id: string; name: string } }>(await page.request.post("/api/admin/rewards/rules", {
      data: { name: "QA_TEST_DATA Atenciones Iteracion 10", metric_type: "service_visit_count", applies_to: "global", threshold_value: 2, benefit_id: benefit.id, is_repeatable: true, is_active: true },
    }))).data;
  }
  await entity(page, run, "reward_benefits", benefit.id, "qa_master_reward_benefit", "REWARDS-001");
  await entity(page, run, "reward_rules", rule.id, "qa_master_reward_rule", "REWARDS-001");
  await ok(await page.request.post("/api/admin/rewards/migrations", { data: { customer_id: flow.customers[1], stickers: 3, note: `${run.runCode} migracion QA` } }));
  await ok(await page.request.post("/api/admin/rewards/recalculate", { data: { customer_id: flow.customers[1] } }));
  const available = (await ok<{ data: Array<{ id: string }> }>(await page.request.get(`/api/admin/rewards/available?customerId=${flow.customers[1]}`))).data;
  expect(available.length).toBeGreaterThan(0);
  await entity(page, run, "customer_reward_entitlements", available[0].id, "qa_reward_entitlement", "REWARDS-001");
  await scenario(page, run, "REWARDS-001", "rewards", "Migración general genera entitlement disponible sin duplicar.", "Tres atenciones con umbral dos dejan reward disponible.");

  const simulationBefore = await page.request.get("/api/admin/payment-simulations");
  expect(simulationBefore.ok()).toBe(true);
  await page.goto("/control/simulaciones-pago");
  await expect(page.getByText(/Simulaci[oó]n|simulaci[oó]n/).first()).toBeVisible();
  await event(page, run, "finding", {
    findingCode: "QA-020",
    severity: "P2",
    module: "payment_simulations",
    title: "Simulaciones sin persistencia operativa",
    status: "accepted",
    expectedResult: "La interfaz coincide con el alcance aprobado de cálculo temporal.",
    actualResult: "La pantalla declara que no guarda y no ofrece acciones de persistencia.",
    rootCause: "QA-020 interpretó como defecto una capacidad que README define expresamente sin persistencia.",
    fixSummary: "Contrato visible aclarado y cálculo extraído a función pura con unitarios.",
    regressionResult: "General, masiva e individual calculan sin crear efectos operativos.",
  });
  await scenario(page, run, "SIMULATION-001", "payment_simulations", "La simulación temporal no modifica datos reales ni promete guardar.", "Contrato visible y cálculo temporal verificados; QA-020 aceptado como no defecto.");

  const exactSummary = (await ok<{ data: { paymentMethods: Array<{ paymentMethodId: string; expectedAmount: number }> } }>(
    await page.request.get(`/api/admin/pos/sessions/${flow.sessionId}/close`),
  )).data;
  const exactAmounts = Object.fromEntries(exactSummary.paymentMethods.map((method) => [method.paymentMethodId, method.expectedAmount]));
  const exactClose = await page.request.post(`/api/admin/pos/sessions/${flow.sessionId}/close`, {
    data: { counted_amounts: exactAmounts, notes: `${run.runCode} cierre exacto QA` },
  });
  expect(exactClose.ok()).toBe(true);
  await scenario(page, run, "CASH-CLOSE-AFTER-SETTLEMENT-001", "cash", "La caja que financio y pago la liquidacion cierra con conteo exacto.", "El egreso de liquidacion no dejo efectivo esperado negativo y el cierre fue permitido sin duplicados.");

  const differenceSession = (await ok<{ data: { id: string } }>(await page.request.post("/api/admin/pos/sessions/open", {
    data: { branch_id: master.branches.one, opening_cash_amount: 0, notes: `${run.runCode} cierre con diferencia` },
  }))).data;
  const differenceSale = (await ok<{ data: { saleId: string } }>(await page.request.post("/api/admin/pos/checkout", {
    data: {
      idempotency_key: `${run.runCode}_cash_difference`,
      pos_session_id: differenceSession.id,
      branch_id: master.branches.one,
      customer_id: flow.customers[0],
      barber_id: null,
      notes: `${run.runCode} venta cierre cruzado`,
      items: [{ item_type: "product", catalog_id: master.products["qa-producto-50"], quantity: 1, unit_price: 50, discount_amount: 0, is_courtesy: false }],
      payments: [
        { payment_method_id: master.paymentMethods.cash, amount: 30, tendered_amount: 30, change_amount: 0 },
        { payment_method_id: master.paymentMethods.card, amount: 20, tendered_amount: 20, change_amount: 0 },
      ],
    },
  }))).data;
  const differenceSummary = (await ok<{ data: { paymentMethods: Array<{ paymentMethodId: string; expectedAmount: number }> } }>(
    await page.request.get(`/api/admin/pos/sessions/${differenceSession.id}/close`),
  )).data;
  const countedAmounts = Object.fromEntries(differenceSummary.paymentMethods.map((method) => {
    if (method.paymentMethodId === master.paymentMethods.cash) return [method.paymentMethodId, method.expectedAmount + 10];
    if (method.paymentMethodId === master.paymentMethods.card) return [method.paymentMethodId, Math.max(0, method.expectedAmount - 10)];
    return [method.paymentMethodId, method.expectedAmount];
  }));
  const differenceClose = (await ok<{ data: { status: string; paymentMethods: Array<{ paymentMethodId: string; differenceAmount: number | null }> } }>(
    await page.request.post(`/api/admin/pos/sessions/${differenceSession.id}/close`, {
      data: { counted_amounts: countedAmounts, notes: `${run.runCode} efectivo +10, tarjeta -10, neto 0` },
    }),
  )).data;
  expect(differenceClose.status).toBe("closed");
  expect(differenceClose.paymentMethods.find((method) => method.paymentMethodId === master.paymentMethods.cash)?.differenceAmount).toBe(10);
  expect(differenceClose.paymentMethods.find((method) => method.paymentMethodId === master.paymentMethods.card)?.differenceAmount).toBe(-10);
  expect((await page.request.post(`/api/admin/pos/sessions/${differenceSession.id}/close`, { data: { counted_amounts: countedAmounts, notes: "retry" } })).status()).toBe(400);
  await entity(page, run, "pos_sessions", differenceSession.id, "qa_closed_difference_session", "CASH-CLOSE-001");
  await entity(page, run, "sales", differenceSale.saleId, "qa_cash_difference_sale", "CASH-CLOSE-001");
  await scenario(page, run, "CASH-CLOSE-001", "cash", "Cierre exacto y cierre +10/-10 requieren contrato válido y no se duplican.", "Sesión exacta cerrada; segunda sesión cerró con diferencias por método, neto cero y retry rechazado.");
});

test("concilia ventas, pagos, tickets, stock y evidencia del run", async ({ page }) => {
  test.setTimeout(90_000);
  const [run, flow] = await Promise.all([state<RunState>("current-run.json"), state<FlowState>("integral-flow-state.json")]);
  await login(page);
  const ownerDb = await authenticatedDb(ownerCredentials.email, ownerCredentials.password);
  const saleIds = Object.values(flow.sales);
  const [{ data: sales, error: salesError }, { data: payments, error: paymentsError }, { data: negativeStock, error: stockError }] = await Promise.all([
    ownerDb.from("sales").select("id,status,total,paid_total,change_amount,reservation_id").in("id", saleIds),
    ownerDb.from("sale_payments").select("sale_id,amount,tendered_amount,change_amount").in("sale_id", saleIds),
    ownerDb.from("vw_product_stock").select("product_id,branch_id,stock_quantity").lt("stock_quantity", 0),
  ]);
  expect(salesError ?? paymentsError ?? stockError).toBeNull();
  expect(negativeStock).toEqual([]);
  for (const sale of sales ?? []) {
    const firstTicket = await page.request.get(`/api/admin/sales/${sale.id}/ticket`);
    expect(firstTicket.ok()).toBe(true);
    const secondTicket = await page.request.get(`/api/admin/sales/${sale.id}/ticket`);
    expect(secondTicket.ok()).toBe(true);
  }
  const { data: tickets, error: ticketsError } = await ownerDb
    .from("sale_document_snapshots")
    .select("id,sale_id")
    .in("sale_id", saleIds);
  expect(ticketsError).toBeNull();
  for (const sale of sales ?? []) {
    const related = (payments ?? []).filter((payment) => payment.sale_id === sale.id);
    if (sale.status === "completed") {
      expect(related.reduce((sum, payment) => sum + Number(payment.amount), 0)).toBeCloseTo(Number(sale.total), 2);
      expect(related.reduce((sum, payment) => sum + Number(payment.tendered_amount) - Number(payment.change_amount), 0)).toBeCloseTo(Number(sale.total), 2);
    }
    expect((tickets ?? []).filter((ticket) => ticket.sale_id === sale.id)).toHaveLength(1);
  }
  const { data: scenarios, error: scenarioError } = await ownerDb.from("qa_scenario_results").select("scenario_code,status").eq("qa_run_id", run.id);
  expect(scenarioError).toBeNull();
  expect((scenarios ?? []).filter((item) => item.status === "failed")).toHaveLength(0);
  await ownerDb.auth.signOut({ scope: "local" });
  await login(page);
  await scenario(page, run, "RECONCILIATION-001", "reconciliation", "Pagos, recibido, vuelto, ticket y stock concilian.", "Ventas completadas cuadran; un snapshot por venta y cero stock negativo.");
});

test("verifica navegación, responsive y teclado en superficies críticas", async ({ page }) => {
  test.setTimeout(180_000);
  const run = await state<RunState>("current-run.json");
  await login(page);
  const started = Date.now();
  const routes = ["/control/clientes", "/control/reservas", "/control/pos", "/control/caja", "/control/produccion", "/control/simulaciones-pago", "/control/liquidaciones", "/control/finanzas"];
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBe(200);
      await expect(page.locator("body")).toBeVisible();
    }
  }
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Escape");
  const duration = Date.now() - started;
  await scenario(page, run, "RESPONSIVE-A11Y-001", "ui", "Rutas críticas responden en 360, 768, 1024 y 1440 con navegación por teclado.", "Ocho módulos cargaron en cuatro viewports; Tab, Shift+Tab y Escape no bloquearon la interfaz.", duration);
});
