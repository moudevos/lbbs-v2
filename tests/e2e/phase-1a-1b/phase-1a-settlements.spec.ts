import crypto from "node:crypto";

import { loadEnvConfig } from "@next/env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, request as playwrightRequest, test, type APIRequestContext, type APIResponse, type Page } from "@playwright/test";

import { closeQaOpenSessions, openFreshQaSession } from "../qa-pos-sessions";

// Playwright is invoked directly in this harness.  Load the same project env files
// as Next before deciding whether a mutable acceptance run is permitted.
loadEnvConfig(process.cwd());

// 1A is an intentionally serial lifecycle: later acceptance cases consume the
// explicit QA fixture state produced by the preceding lifecycle transition.
test.describe.configure({ mode: "serial" });
test.use({ trace: "retain-on-failure", screenshot: "only-on-failure", video: "retain-on-failure" });

type Settlement = { id: string; status: string; settlement_number: string; gross_pay_amount: number | string; debt_deduction_total: number | string; net_pay_amount: number | string; mandatory_discount_amount: number | string };
type Detail = { data: Settlement & { payroll_period_id: string; employee_id: string; branch_id: string; net_before_mandatory_discount: number | string }; services: Array<Record<string, unknown>>; productLines: Array<Record<string, unknown>>; bonuses: Array<Record<string, unknown>>; deductions: Array<Record<string, unknown>>; payments: Array<Record<string, unknown>> };
type Fixture = {
  prefix: string; branchId: string; employeeId: string; customerId: string; serviceId: string; productId: string;
  periodId: string; debtId: string; cashId: string; yapeId: string; transferId: string; settlement?: Settlement;
  reservedSettlement?: Settlement; paymentSessionId?: string; paidDetail?: Detail; secondDebtId?: string;
  personnelBaselineBeforeClose?: number; personnelBaselineAtClose?: number;
};

const fixture: Fixture = {} as Fixture;
let api: APIRequestContext | undefined;
let cleanupApi: APIRequestContext | undefined;
const activeQaSessions = new Map<string, { branchId: string; runCode: string }>();
const qaRuleIds: Array<{ kind: "operational" | "product_bonus"; id: string }> = [];
const money = (value: unknown) => Number(Number(value ?? 0).toFixed(2));
const marker = () => `QA_E2E_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}_${crypto.randomUUID().slice(0, 8)}`;

function configuredProjectRef() {
  try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname.split(".")[0] || null; } catch { return null; }
}

function mutableBlockReason() {
  const environment = process.env.QA_ENVIRONMENT;
  if (process.env.QA_ALLOW_MUTATIONS !== "true") return "QA mutable bloqueada: QA_ALLOW_MUTATIONS != true";
  if (!["development", "test", "staging"].includes(environment ?? "")) return "QA mutable bloqueada: QA_ENVIRONMENT no permitido";
  if (!configuredProjectRef()) return "QA mutable bloqueada: Supabase project ref no disponible";
  if (process.env.QA_SAFE_SUPABASE_PROJECT_REF !== configuredProjectRef()) return "QA mutable bloqueada: Supabase project ref no coincide";
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100")) return "QA mutable bloqueada: PLAYWRIGHT_BASE_URL no es local";
  if (!process.env.E2E_DB_EMAIL || !process.env.E2E_DB_PASSWORD) return "QA mutable bloqueada: E2E_DB_EMAIL/E2E_DB_PASSWORD requeridos para evidencia DB";
  return null;
}

function credentials() {
  const email = process.env.E2E_ADMIN_EMAIL ?? process.env.QA_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD ?? process.env.QA_PASSWORD;
  return email && password ? { email, password } : null;
}

async function payload<T>(response: APIResponse): Promise<T> {
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  expect(response.ok(), body.error ?? `HTTP ${response.status()}`).toBe(true);
  return body;
}

async function login(page: Page) {
  const auth = credentials();
  const email = auth?.email;
  const password = auth?.password;
  if (!email || !password) throw new Error("Faltan QA_EMAIL/QA_PASSWORD para la aceptación mutable.");
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(/\/control$/, { timeout: 30_000 });
}

async function db(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const dbEmail = process.env.E2E_DB_EMAIL;
  const dbPassword = process.env.E2E_DB_PASSWORD;
  if (!url || !key || !dbEmail || !dbPassword) throw new Error("E2E_DB_EMAIL/E2E_DB_PASSWORD requeridos para evidencia DB.");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email: dbEmail, password: dbPassword });
  if (error) throw new Error(`No se pudo abrir lectura QA: ${error.message}`);
  return client;
}

async function closeQaDb(client: SupabaseClient) {
  const { error } = await client.auth.signOut({ scope: "local" });
  expect(error).toBeNull();
}

async function detail(request: APIRequestContext, id: string) {
  return payload<Detail>(await request.get(`/api/admin/settlements/${id}`));
}

async function action(request: APIRequestContext, id: string, data: Record<string, unknown>) {
  return payload<{ data: Settlement }>(await request.post(`/api/admin/settlements/${id}`, { data }));
}

async function createDraft(request: APIRequestContext, employeeId = fixture.employeeId, debtDeductions: Array<{ debtId: string; amount: number }> = []) {
  return (await payload<{ data: Settlement }>(await request.post("/api/admin/settlements", { data: {
    periodId: fixture.periodId, employeeId, commissionRate: 60, debtDeductions,
    notes: `${fixture.prefix} liquidación de aceptación`,
  } }))).data;
}

async function openQaPosSession(request: APIRequestContext, amount: number) {
  const session = await openFreshQaSession(request, fixture.branchId, amount, fixture.prefix);
  activeQaSessions.set(session.id, { branchId: fixture.branchId, runCode: fixture.prefix });
  return session.id;
}

async function closeQaPosSession(request: APIRequestContext, sessionId: string) {
  const tracked = activeQaSessions.get(sessionId);
  if (!tracked) return;
  await closeQaOpenSessions(request, tracked.branchId, tracked.runCode);
  activeQaSessions.delete(sessionId);
}

async function cleanupTrackedQaPosSessions(request: APIRequestContext) {
  for (const [sessionId, tracked] of [...activeQaSessions]) {
    try {
      await closeQaOpenSessions(request, tracked.branchId, tracked.runCode);
      activeQaSessions.delete(sessionId);
    } catch (error) {
      throw new Error(
        `No se pudo limpiar la sesión POS QA sessionId=${sessionId} branchId=${tracked.branchId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

function personnelCost(analysis: unknown) {
  const data = analysis as { personnel?: { recognizedPersonnelCost?: unknown } };
  const value = Number(data.personnel?.recognizedPersonnelCost);
  expect(Number.isFinite(value), "analysis-v2 debe exponer personnel.recognizedPersonnelCost").toBe(true);
  return money(value);
}

async function financialPostings(settlementId: string) {
  const client = await db();
  try {
    const result = await client.from("financial_postings").select("id,amount,accounting_date,financial_group,posting_code,status").eq("source_type", "employee_settlement").eq("source_id", settlementId).eq("status", "posted");
    expect(result.error).toBeNull();
    return result.data ?? [];
  } finally {
    await closeQaDb(client);
  }
}

test.beforeEach(async ({ page }) => {
  const blocked = mutableBlockReason();
  if (blocked) test.skip(true, blocked);
  test.skip(!credentials(), "QA mutable bloqueada: faltan E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD (o QA_EMAIL/QA_PASSWORD).");
  await login(page);
  api = page.request;
  if (!cleanupApi) {
    cleanupApi = await playwrightRequest.newContext({
      baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100",
      storageState: await page.context().storageState(),
    });
  }
});

test.afterEach(async () => {
  if (!api) return;
  await cleanupTrackedQaPosSessions(api);
});

test.afterAll(async () => {
  if (!cleanupApi) return;
  try {
    await cleanupTrackedQaPosSessions(cleanupApi);
    for (const rule of qaRuleIds) {
      await payload(await cleanupApi.patch(`/api/admin/compensation-rules/${rule.kind}`, { data: { id: rule.id, is_active: false } }));
    }
  } finally {
    await cleanupApi.dispose();
  }
});

test("1A-01 — crear liquidación draft", async ({ page }) => {
  const request = page.request;
  fixture.prefix = marker();
  const bootstrap = await payload<{ periods: Array<{ id: string; end_date: string }>; paymentMethods: Array<{ id: string; code: string; payment_kind: string }>; employees: Array<{ branch_id: string | null }> }>(await request.get("/api/admin/settlements"));
  const branchId = bootstrap.employees.find((employee) => employee.branch_id)?.branch_id;
  expect(branchId).toBeTruthy(); fixture.branchId = branchId!;
  const period = bootstrap.periods.find((item) => item.end_date === "2026-09-30");
  expect(period, "El fixture canónico exige un período que cierre el 30/09/2026.").toBeTruthy(); fixture.periodId = period!.id;
  const methods = bootstrap.paymentMethods;
  fixture.cashId = methods.find((item) => item.payment_kind === "cash")?.id ?? "";
  fixture.yapeId = methods.find((item) => /yape|plin|wallet|qr/i.test(`${item.code} ${item.payment_kind}`))?.id ?? "";
  fixture.transferId = methods.find((item) => /transfer/i.test(`${item.code} ${item.payment_kind}`))?.id ?? "";
  expect([fixture.cashId, fixture.yapeId, fixture.transferId].every(Boolean), "Se requieren efectivo, Yape/QR y transferencia activos.").toBe(true);

  const employee = await payload<{ data: { id: string } }>(await request.post("/api/admin/employees", { data: { full_name: `${fixture.prefix} Barbero`, email: `${fixture.prefix.toLowerCase()}@qa.invalid`, branch_id: fixture.branchId, role: "barber", status: "active", can_login: false, notes: fixture.prefix } }));
  fixture.employeeId = employee.data.id;
  await payload(await request.post(`/api/admin/employees/${fixture.employeeId}/compensation`, { data: { compensationMode: "commission_plus_bonus", baseMonthlySalary: 0, mandatoryDiscountEnabled: true, mandatoryDiscountRate: 1, effectiveFrom: "2026-09-01", notes: fixture.prefix, replaceCurrent: true } }));
  const customer = await payload<{ data: { id: string } }>(await request.post("/api/admin/customers", { data: { document_type: "DNI", document_number: String(Date.now()).slice(-8), first_name: fixture.prefix, last_name: "Cliente", phone: `9${String(Date.now()).slice(-8)}`, notes: fixture.prefix } }));
  fixture.customerId = customer.data.id;
  const service = await payload<{ data: { id: string } }>(await request.post("/api/admin/services", { data: { name: `${fixture.prefix} Servicio`, slug: `${fixture.prefix}-servicio`, base_price: 185, duration_minutes: 30, is_active: true } }));
  fixture.serviceId = service.data.id;
  const categories = await payload<{ data: Array<{ id: string; business_line: string; is_active: boolean }> }>(await request.get("/api/admin/product-categories"));
  const categoryId = categories.data.find((item) => item.is_active && ["barbershop_products", "cafeteria_products"].includes(item.business_line))?.id;
  expect(categoryId, "Se necesita una categoría comercial existente para el producto QA.").toBeTruthy();
  const product = await payload<{ data: { id: string } }>(await request.post("/api/admin/products", { data: { name: `${fixture.prefix} Producto`, slug: `${fixture.prefix}-producto`, sku: fixture.prefix, category_id: categoryId, unit: "unidad", cost_price: 0, base_sale_price: 105, is_stockable: false, visibility_scope: "pos", is_active: true } }));
  fixture.productId = product.data.id;
  const productBonus = await payload<{ data: { id: string } }>(await request.post("/api/admin/compensation-rules/product_bonus", { data: { name: `${fixture.prefix} bono producto`, scope_type: "product", scope_id: fixture.productId, value: 6, priority: 999999, effective_from: "2026-09-01", is_active: true } }));
  qaRuleIds.push({ kind: "product_bonus", id: productBonus.data.id });
  const operationalRule = await payload<{ data: { id: string } }>(await request.post("/api/admin/compensation-rules/operational", { data: { name: `${fixture.prefix} contribución`, calculation_type: "fixed", value: 14, minimum_amount: 185, maximum_amount: 185, priority: 999999, effective_from: "2026-09-01", is_active: true } }));
  qaRuleIds.push({ kind: "operational", id: operationalRule.data.id });
  const debt = await payload<{ data: { id: string } }>(await request.post("/api/admin/employee-debts", { data: { action: "create", employeeId: fixture.employeeId, branchId: fixture.branchId, debtType: "penalty", amount: 100, description: `${fixture.prefix} deuda canónica` } }));
  fixture.debtId = debt.data.id;
  const saleSession = await openQaPosSession(request, 0);
  await payload(await request.post("/api/admin/pos/checkout", { data: { idempotency_key: `${fixture.prefix}_canonical`, pos_session_id: saleSession, branch_id: fixture.branchId, customer_id: fixture.customerId, barber_id: fixture.employeeId, notes: fixture.prefix, items: [
    { item_type: "service", catalog_id: fixture.serviceId, quantity: 1, unit_price: 185, discount_amount: 0, is_courtesy: false },
    { item_type: "product", catalog_id: fixture.productId, quantity: 1, unit_price: 105, discount_amount: 0, is_courtesy: false },
  ], payments: [{ payment_method_id: fixture.cashId, amount: 290, tendered_amount: 290, change_amount: 0 }] } }));
  await closeQaPosSession(request, saleSession);
  fixture.settlement = await createDraft(request, fixture.employeeId, [{ debtId: fixture.debtId, amount: 60 }]);
  expect(fixture.settlement.status).toBe("draft");
  await page.goto(`/control/liquidaciones/${fixture.settlement.id}`);
  await expect(page.getByText("Borrador")).toBeVisible();
});

test("1A-02 — productos no entran en base comisionable", async ({ page }) => {
  const request = page.request;
  const current = await detail(request, fixture.settlement!.id);
  const serviceBase = current.services.reduce((sum, line) => sum + money(line.commissionable_amount_snapshot ?? line.commissionable_amount), 0);
  expect(serviceBase).toBe(171); expect(serviceBase).not.toBe(276); expect(serviceBase).not.toBe(290);
  await page.goto(`/control/liquidaciones/${fixture.settlement!.id}`); await expect(page.getByText("Base comisionable").first()).toBeVisible();
});

test("1A-03 — descuento obligatorio usa producción total", async ({ page }) => {
  const request = page.request;
  const current = await detail(request, fixture.settlement!.id);
  const recognized = current.services.reduce((sum, line) => sum + money(line.recognized_production_amount_snapshot), 0) + current.productLines.reduce((sum, line) => sum + money(line.recognized_production_amount_snapshot), 0);
  expect(recognized).toBe(290); expect(money(current.data.mandatory_discount_amount)).toBe(2.9);
});

test("1A-04 — deuda se reserva en draft", async ({ page }) => {
  const request = page.request;
  const options = await payload<{ data: Array<{ debt_id: string; outstanding_amount: number | string; active_reserved_amount: number | string; available_debt_amount: number | string }> }>(await request.get(`/api/admin/employee-debts/settlement-options?employeeId=${fixture.employeeId}&branchId=${fixture.branchId}`));
  const debt = options.data.find((item) => item.debt_id === fixture.debtId)!;
  expect(money(debt.outstanding_amount)).toBe(100); expect(money(debt.active_reserved_amount)).toBe(60); expect(money(debt.available_debt_amount)).toBe(40);
});

test("1A-05 — cancelar draft libera reserva", async ({ page }) => {
  const request = page.request;
  const cancelled = await action(request, fixture.settlement!.id, { action: "cancel", reasonCode: "ADMINISTRATIVE_CORRECTION", reason: fixture.prefix });
  expect(cancelled.data.status).toBe("cancelled");
  const options = await payload<{ data: Array<{ debt_id: string; outstanding_amount: number | string; active_reserved_amount: number | string; available_debt_amount: number | string }> }>(await request.get(`/api/admin/employee-debts/settlement-options?employeeId=${fixture.employeeId}&branchId=${fixture.branchId}`));
  const debt = options.data.find((item) => item.debt_id === fixture.debtId)!;
  expect([money(debt.outstanding_amount), money(debt.active_reserved_amount), money(debt.available_debt_amount)]).toEqual([100, 0, 100]);
  fixture.settlement = await createDraft(request, fixture.employeeId, [{ debtId: fixture.debtId, amount: 60 }]);
});

test("1A-06 — draft → review", async ({ page }) => {
  const request = page.request;
  const reviewed = await action(request, fixture.settlement!.id, { action: "review", adjustments: [] });
  expect(reviewed.data.status).toBe("review"); expect(await financialPostings(fixture.settlement!.id)).toHaveLength(0);
  fixture.personnelBaselineBeforeClose = personnelCost((await payload<{ data: unknown }>(await request.get(`/api/admin/finance/analysis-v2?from=2026-09-01&to=2026-09-26&branchId=${fixture.branchId}`))).data);
  fixture.personnelBaselineAtClose = personnelCost((await payload<{ data: unknown }>(await request.get(`/api/admin/finance/analysis-v2?from=2026-09-01&to=2026-09-30&branchId=${fixture.branchId}`))).data);
  await page.goto(`/control/liquidaciones/${fixture.settlement!.id}`); await expect(page.getByText("Confirmada")).toBeVisible();
});

test("1A-07 — review → approved", async ({ page }) => {
  const request = page.request;
  const approved = await action(request, fixture.settlement!.id, { action: "approve" }); expect(approved.data.status).toBe("approved");
  const postings = await financialPostings(fixture.settlement!.id); const personnel = postings.filter((item) => item.financial_group === "personnel_cost");
  expect(personnel).toHaveLength(1); expect(money(personnel[0].amount)).toBe(105.7);
});

test("1A-08 — accounting date", async () => {
  const personnel = (await financialPostings(fixture.settlement!.id)).find((item) => item.financial_group === "personnel_cost");
  expect(personnel?.accounting_date).toBe("2026-09-30");
});

test("1A-09 — P&L antes del cierre", async ({ page }) => {
  const request = page.request;
  const response = await payload<{ data: unknown }>(await request.get(`/api/admin/finance/analysis-v2?from=2026-09-01&to=2026-09-26&branchId=${fixture.branchId}`));
  expect(money(personnelCost(response.data) - fixture.personnelBaselineBeforeClose!)).toBe(0);
});

test("1A-10 — P&L al cierre", async ({ page }) => {
  const request = page.request;
  const response = await payload<{ data: unknown }>(await request.get(`/api/admin/finance/analysis-v2?from=2026-09-01&to=2026-09-30&branchId=${fixture.branchId}`));
  expect(money(personnelCost(response.data) - fixture.personnelBaselineAtClose!)).toBe(105.7);
});

test("1A-11 — pago multipart", async ({ page }) => {
  const request = page.request;
  fixture.paymentSessionId = await openQaPosSession(request, 20);
  const paid = await action(request, fixture.settlement!.id, { action: "pay", paymentParts: [
    { paymentMethodId: fixture.cashId, amount: 20, reference: null }, { paymentMethodId: fixture.yapeId, amount: 20, reference: `${fixture.prefix}-YAPE` }, { paymentMethodId: fixture.transferId, amount: 5.7, reference: `${fixture.prefix}-TRANSFER` },
  ], notes: fixture.prefix });
  expect(paid.data.status).toBe("paid"); fixture.paidDetail = await detail(request, fixture.settlement!.id);
  expect(fixture.paidDetail.payments).toHaveLength(3); expect(money(fixture.paidDetail.payments.reduce((sum, item) => sum + money(item.amount), 0))).toBe(45.7);
  await page.goto(`/control/liquidaciones/${fixture.settlement!.id}`); await expect(page.getByText("Pagada")).toBeVisible();
});

test("1A-12 — solo cash afecta caja", async () => {
  const client = await db();
  try {
    const payment = await client.from("employee_settlement_payments").select("id,cash_movement_id,amount,payment_method_id").eq("settlement_id", fixture.settlement!.id).eq("payment_method_id", fixture.cashId).single();
    expect(payment.error).toBeNull(); expect(payment.data?.cash_movement_id).toBeTruthy();
    const result = await client.from("cash_movements").select("amount,source_type,source_id").eq("id", payment.data!.cash_movement_id!).single();
    expect(result.error).toBeNull(); expect(result.data?.source_type).toBe("employee_settlement_payment"); expect(result.data?.source_id).toBe(payment.data?.id); expect(money(result.data?.amount)).toBe(20);
  } finally {
    await closeQaDb(client);
  }
});

test("1A-13 — pago no duplica P&L", async () => {
  const personnel = (await financialPostings(fixture.settlement!.id)).filter((item) => item.financial_group === "personnel_cost");
  expect(personnel).toHaveLength(1); expect(money(personnel[0].amount)).toBe(105.7);
});

test("1A-14 — deuda se consume solo al paid", async ({ page }) => {
  const request = page.request;
  const data = await payload<{ debts: Array<{ id: string; outstanding_amount: number | string }>; movements: Array<{ debt_id: string; movement_type: string; amount: number | string }> }>(await request.get(`/api/admin/employee-debts?employeeId=${fixture.employeeId}&branchId=${fixture.branchId}&status=all`));
  expect(money(data.debts.find((item) => item.id === fixture.debtId)?.outstanding_amount)).toBe(40);
  expect(data.movements.some((item) => item.debt_id === fixture.debtId && item.movement_type === "settlement_deduction" && money(item.amount) === 60)).toBe(true);
});

test("1A-15 — retry/idempotencia", async ({ page }) => {
  const request = page.request;
  const retry = await request.post(`/api/admin/settlements/${fixture.settlement!.id}`, { data: { action: "pay", paymentParts: [{ paymentMethodId: fixture.cashId, amount: 45.7, reference: fixture.prefix }] } });
  expect(retry.status()).toBe(400); const after = await detail(request, fixture.settlement!.id); expect(after.data.status).toBe("paid"); expect(after.payments).toHaveLength(3);
});

test("1A-16 — paid immutable", async ({ page }) => {
  const request = page.request;
  for (const data of [{ action: "approve" }, { action: "cancel", reasonCode: "DUPLICATE", reason: fixture.prefix }, { action: "review", adjustments: [] }, { action: "confirm", adjustments: [] }, { action: "pay", paymentParts: [{ paymentMethodId: fixture.cashId, amount: 45.7, reference: fixture.prefix }] }]) {
    expect((await request.post(`/api/admin/settlements/${fixture.settlement!.id}`, { data })).status()).toBe(400);
  }
});

test("1A-17 — detalle/documento", async ({ page }) => {
  const request = page.request;
  const current = await detail(request, fixture.settlement!.id); const document = await request.get(`/api/admin/settlements/${fixture.settlement!.id}/document`);
  expect(document.status()).toBe(200); expect(document.headers()["content-type"]).toContain("application/pdf"); expect(document.headers()["content-disposition"]).toBeTruthy(); expect((await document.body()).byteLength).toBeGreaterThan(0);
  expect(money(current.data.net_pay_amount)).toBe(45.7); expect(money(current.data.mandatory_discount_amount)).toBe(2.9); expect(money(current.data.debt_deduction_total)).toBe(60);
  await page.goto(`/control/liquidaciones/${fixture.settlement!.id}`); await page.getByRole("button", { name: "Ver documento" }).click(); await expect(page.getByText(/Neto final/i)).toBeVisible();
});

test("1A-18 — concurrencia/reservas", async ({ page }) => {
  const request = page.request;
  const debt = await payload<{ data: { id: string } }>(await request.post("/api/admin/employee-debts", { data: { action: "create", employeeId: fixture.employeeId, branchId: fixture.branchId, debtType: "penalty", amount: 100, description: `${fixture.prefix} deuda reservas` } })); fixture.secondDebtId = debt.data.id;
  // There is no public API for choosing the accounting date of a POS sale.
  // These are QA-only source rows, moved only between QA payroll periods so the
  // two live reservations can coexist without touching human production.
  const client = await db(); let periodResult;
  try { periodResult = await client.rpc("get_or_create_payroll_period", { p_date: "2026-10-15" }); } finally { await closeQaDb(client); }
  expect(periodResult.error).toBeNull();
  const alternatePeriod = periodResult.data as { id: string }; const originalPeriod = fixture.periodId; fixture.periodId = alternatePeriod.id;
  const saleSessionA = await openQaPosSession(request, 0);
  const saleA = await payload<{ data: { saleId: string } }>(await request.post("/api/admin/pos/checkout", { data: { idempotency_key: `${fixture.prefix}_reserve_a`, pos_session_id: saleSessionA, branch_id: fixture.branchId, customer_id: fixture.customerId, barber_id: fixture.employeeId, notes: `${fixture.prefix} reserva A`, items: [{ item_type: "service", catalog_id: fixture.serviceId, quantity: 1, unit_price: 185, discount_amount: 0, is_courtesy: false }], payments: [{ payment_method_id: fixture.cashId, amount: 185, tendered_amount: 185, change_amount: 0 }] } }));
  await closeQaPosSession(request, saleSessionA);
  const moveA = await db(); let movedA;
  try { movedA = await moveA.from("employee_service_production").update({ payroll_period_id: alternatePeriod.id, production_date: "2026-10-15", accounting_date: "2026-10-15" }).eq("sale_id", saleA.data.saleId); } finally { await closeQaDb(moveA); }
  expect(movedA.error).toBeNull();
  const a = await createDraft(request, fixture.employeeId, [{ debtId: fixture.secondDebtId, amount: 30 }]);
  const client2 = await db(); let periodResult2;
  try { periodResult2 = await client2.rpc("get_or_create_payroll_period", { p_date: "2026-10-30" }); } finally { await closeQaDb(client2); }
  expect(periodResult2.error).toBeNull(); fixture.periodId = (periodResult2.data as { id: string }).id;
  const saleSessionB = await openQaPosSession(request, 0);
  const saleB = await payload<{ data: { saleId: string } }>(await request.post("/api/admin/pos/checkout", { data: { idempotency_key: `${fixture.prefix}_reserve_b`, pos_session_id: saleSessionB, branch_id: fixture.branchId, customer_id: fixture.customerId, barber_id: fixture.employeeId, notes: `${fixture.prefix} reserva B`, items: [{ item_type: "service", catalog_id: fixture.serviceId, quantity: 1, unit_price: 185, discount_amount: 0, is_courtesy: false }], payments: [{ payment_method_id: fixture.cashId, amount: 185, tendered_amount: 185, change_amount: 0 }] } }));
  await closeQaPosSession(request, saleSessionB);
  const moveB = await db(); let movedB;
  try { movedB = await moveB.from("employee_service_production").update({ payroll_period_id: fixture.periodId, production_date: "2026-10-30", accounting_date: "2026-10-30" }).eq("sale_id", saleB.data.saleId); } finally { await closeQaDb(moveB); }
  expect(movedB.error).toBeNull();
  const b = await createDraft(request, fixture.employeeId, [{ debtId: fixture.secondDebtId, amount: 20 }]); fixture.periodId = originalPeriod;
  const options = await payload<{ data: Array<{ debt_id: string; outstanding_amount: number | string; active_reserved_amount: number | string; available_debt_amount: number | string }> }>(await request.get(`/api/admin/employee-debts/settlement-options?employeeId=${fixture.employeeId}&branchId=${fixture.branchId}`)); const row = options.data.find((item) => item.debt_id === fixture.secondDebtId)!;
  expect([money(row.outstanding_amount), money(row.active_reserved_amount), money(row.available_debt_amount)]).toEqual([100, 50, 50]);
  await action(request, a.id, { action: "review", adjustments: [] }); await action(request, a.id, { action: "approve" });
  const paySessionA = await openQaPosSession(request, 100); const detailA = await detail(request, a.id);
  await action(request, a.id, { action: "pay", paymentParts: [{ paymentMethodId: fixture.cashId, amount: money(detailA.data.net_pay_amount), reference: `${fixture.prefix}-A` }] });
  await closeQaPosSession(request, paySessionA);
  const afterA = await payload<{ debts: Array<{ id: string; outstanding_amount: number | string }> }>(await request.get(`/api/admin/employee-debts?employeeId=${fixture.employeeId}&branchId=${fixture.branchId}&status=all`));
  expect(money(afterA.debts.find((item) => item.id === fixture.secondDebtId)?.outstanding_amount)).toBe(70);
  await action(request, b.id, { action: "review", adjustments: [] }); await action(request, b.id, { action: "approve" });
  const paySessionB = await openQaPosSession(request, 100); const detailB = await detail(request, b.id);
  await action(request, b.id, { action: "pay", paymentParts: [{ paymentMethodId: fixture.cashId, amount: money(detailB.data.net_pay_amount), reference: `${fixture.prefix}-B` }] });
  await closeQaPosSession(request, paySessionB);
  const afterB = await payload<{ debts: Array<{ id: string; outstanding_amount: number | string }> }>(await request.get(`/api/admin/employee-debts?employeeId=${fixture.employeeId}&branchId=${fixture.branchId}&status=all`));
  expect(money(afterB.debts.find((item) => item.id === fixture.secondDebtId)?.outstanding_amount)).toBe(50);
  expect([paySessionA, paySessionB].every(Boolean)).toBe(true);
});

test("1A-19 — varias liquidaciones mismo periodo", async ({ page }) => {
  const request = page.request;
  const sessionId = await openQaPosSession(request, 0);
  const sale = await payload<{ data: { saleId: string } }>(await request.post("/api/admin/pos/checkout", { data: {
    idempotency_key: `${fixture.prefix}_production_y`, pos_session_id: sessionId, branch_id: fixture.branchId,
    customer_id: fixture.customerId, barber_id: fixture.employeeId, notes: `${fixture.prefix} producción Y`,
    items: [{ item_type: "service", catalog_id: fixture.serviceId, quantity: 1, unit_price: 185, discount_amount: 0, is_courtesy: false }],
    payments: [{ payment_method_id: fixture.cashId, amount: 185, tendered_amount: 185, change_amount: 0 }],
  } }));
  await closeQaPosSession(request, sessionId);
  const liqB = await createDraft(request);
  fixture.reservedSettlement = liqB;
  const client = await db();
  let lines;
  try {
    lines = await client.from("employee_settlement_service_lines").select("settlement_id,employee_service_production_id,production:employee_service_production(sale_id)").in("settlement_id", [fixture.settlement!.id, liqB.id]);
  } finally {
    await closeQaDb(client);
  }
  expect(lines.error).toBeNull();
  const lineForB = (lines.data ?? []).filter((line) => line.settlement_id === liqB.id);
  expect(lineForB.length).toBeGreaterThan(0);
  expect(lineForB.some((line) => (line.production as { sale_id?: string } | null)?.sale_id === sale.data.saleId)).toBe(true);
  const paidSourceIds = new Set((lines.data ?? []).filter((line) => line.settlement_id === fixture.settlement!.id).map((line) => line.employee_service_production_id));
  expect(lineForB.some((line) => paidSourceIds.has(line.employee_service_production_id))).toBe(false);
});

test("1A-20 — cancelled libera source", async ({ page }) => {
  const request = page.request;
  const before = await detail(request, fixture.reservedSettlement!.id);
  const beforeSources = new Set(before.services.map((line) => String(line.employee_service_production_id ?? "")).filter(Boolean));
  expect(beforeSources.size).toBeGreaterThan(0);
  const cancelled = await action(request, fixture.reservedSettlement!.id, { action: "cancel", reasonCode: "WRONG_PRODUCTION", reason: fixture.prefix }); expect(cancelled.data.status).toBe("cancelled");
  const recreated = await createDraft(request, fixture.employeeId, []); const after = await detail(request, recreated.id);
  const afterSources = new Set(after.services.map((line) => String(line.employee_service_production_id ?? "")).filter(Boolean));
  expect([...beforeSources].some((id) => afterSources.has(id))).toBe(true);
});
