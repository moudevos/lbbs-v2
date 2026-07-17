import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type APIResponse, type Page } from "@playwright/test";

import { openFreshQaSession } from "./qa-pos-sessions";

test.use({ trace: "off", screenshot: "off", video: "off" });

type RunState = { id: string; runCode: string };
type MasterState = {
  branches: { one: string; two: string };
  employees: { barberOne: string; barberTwo: string };
  services: Record<string, string>;
  products: Record<string, string>;
  paymentMethods: { cash: string; qr: string; card: string };
};
type Customer = { id: string; document_number: string | null; full_name: string };
type Reservation = { id: string; branch_id: string; status: string; customer_id: string };
type SaleResult = {
  saleId: string;
  total: number;
  paidTotal: number;
  changeAmount: number;
  items: Array<{ id: string }>;
  payments: Array<{ id: string; amount: number; tendered_amount: number; change_amount: number }>;
};

const credentials = (() => {
  const email = process.env.QA_EMAIL;
  const password = process.env.QA_PASSWORD;
  if (!email || !password) throw new Error("Faltan credenciales owner QA.");
  return { email, password };
})();

const qaDirectory = path.resolve(process.cwd(), ".qa");
const runPath = path.join(qaDirectory, "current-run.json");
const masterPath = path.join(qaDirectory, "master-state.json");
const flowPath = path.join(qaDirectory, "integral-flow-state.json");

async function json<T>(response: APIResponse): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Respuesta no JSON (${response.status()}).`);
  }
}

async function ok<T>(response: APIResponse): Promise<T> {
  const payload = await json<T & { error?: string }>(response);
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

async function evidence(page: Page, run: RunState, action: "entity" | "scenario" | "finding", data: Record<string, unknown>) {
  await ok(await page.request.post("/api/admin/qa/events", { data: { action, data: { qaRunId: run.id, ...data } } }));
}

async function scenario(page: Page, run: RunState, code: string, module: string, expected: string, actual: string) {
  await evidence(page, run, "scenario", {
    scenarioCode: code,
    module,
    status: "passed",
    expectedResult: expected,
    actualResult: actual,
    evidence: { persistent: true },
    finishedAt: new Date().toISOString(),
  });
}

async function entity(page: Page, run: RunState, table: string, id: string, type: string, scenarioCode: string) {
  await evidence(page, run, "entity", {
    entityTable: table,
    entityId: id,
    entityType: type,
    scenarioCode,
    metadata: { persistent: true },
  });
}

async function finding(page: Page, run: RunState, data: Record<string, unknown>) {
  await evidence(page, run, "finding", data);
}

function salePayload(input: {
  key: string;
  master: MasterState;
  sessionId: string;
  customerId: string;
  reservationId?: string | null;
  items?: Array<Record<string, unknown>>;
  payments: Array<Record<string, unknown>>;
}) {
  return {
    idempotency_key: input.key,
    pos_session_id: input.sessionId,
    branch_id: input.master.branches.one,
    customer_id: input.customerId,
    reservation_id: input.reservationId ?? null,
    barber_id: input.master.employees.barberOne,
    notes: `QA_TEST_DATA ${input.key}`,
    items: input.items ?? [
      { item_type: "service", catalog_id: input.master.services["qa-servicio-100"], quantity: 1, unit_price: 100, discount_amount: 0, is_courtesy: false },
      { item_type: "product", catalog_id: input.master.products["qa-producto-50"], quantity: 1, unit_price: 50, discount_amount: 0, is_courtesy: false },
    ],
    payments: input.payments,
  };
}

test("ejecuta clientes, reservas, POS, pagos, idempotencia, stock y anulacion", async ({ page }) => {
  test.setTimeout(240_000);
  const run = JSON.parse(await readFile(runPath, "utf8")) as RunState;
  const master = JSON.parse(await readFile(masterPath, "utf8")) as MasterState;
  const attemptId = crypto.randomUUID().slice(0, 8);
  await login(page);

  const runSequence = run.runCode.split("_").at(-1)?.padStart(3, "0") ?? "000";
  const customerDefinitions = [
    { document: `92${runSequence}001`, phone: `990${runSequence}001`, first: "QA Cliente Uno" },
    { document: `92${runSequence}002`, phone: `990${runSequence}002`, first: "QA Cliente Dos" },
  ];
  let customers = (await ok<{ data: Customer[] }>(await page.request.get("/api/admin/customers"))).data;
  const selectedCustomers: Customer[] = [];
  for (const definition of customerDefinitions) {
    const existingMatches = customers.filter((item) => item.document_number === definition.document);
    let customer = existingMatches[0];
    if (!customer) {
      customer = (await ok<{ data: Customer }>(await page.request.post("/api/admin/customers", {
        data: {
          document_type: "DNI",
          document_number: definition.document,
          first_name: definition.first,
          last_name: run.runCode,
          phone: definition.phone,
          notes: `${run.runCode} cliente persistente`,
        },
      }))).data;
      customers = [...customers, customer];
    }
    selectedCustomers.push(customer);
    await entity(page, run, "customers", customer.id, "qa_transaction_customer", "CUSTOMER-001");
    for (const duplicateEvidence of existingMatches.slice(1)) {
      await entity(page, run, "customers", duplicateEvidence.id, "qa_duplicate_customer_evidence", "CUSTOMER-001");
    }
  }
  const duplicate = await page.request.post("/api/admin/customers", {
    data: { document_type: "DNI", document_number: customerDefinitions[0].document, first_name: "Duplicado", last_name: "QA", phone: "991000099" },
  });
  expect(duplicate.status()).toBe(400);
  await finding(page, run, {
    findingCode: "QA-015",
    severity: "P2",
    module: "customers",
    title: "Documento duplicado permitido por API",
    status: "verified",
    expectedResult: "La API rechaza documentos repetidos.",
    actualResult: "La regresion devuelve 400 con mensaje de usuario.",
    rootCause: "El alta solo dependia de la unicidad del celular.",
    fixSummary: "Validacion compartida de celular y documento en altas y ediciones.",
    regressionResult: "Verificado en CUSTOMER-001.",
    metadata: { persistentEvidence: true },
  });
  await scenario(page, run, "CUSTOMER-001", "customers", "Alta idempotente y duplicado rechazado.", "Dos clientes QA persistentes; documento duplicado devuelve 400.");

  let reservations = (await ok<{ data: Reservation[] }>(await page.request.get("/api/admin/reservations"))).data;
  const reservationDefinitions = [
    { customer: selectedCustomers[0], branch: master.branches.one, barber: master.employees.barberOne },
    { customer: selectedCustomers[1], branch: master.branches.two, barber: master.employees.barberTwo },
  ];
  const selectedReservations: Reservation[] = [];
  for (const definition of reservationDefinitions) {
    let reservation = reservations.find((item) =>
      item.customer_id === definition.customer.id &&
      item.branch_id === definition.branch &&
      !["completed", "cancelled"].includes(item.status),
    );
    if (!reservation) {
      reservation = (await ok<{ data: Reservation }>(await page.request.post("/api/admin/reservations", {
        data: {
          customer_id: definition.customer.id,
          branch_id: definition.branch,
          preferred_barber_id: definition.barber,
          service_interest_id: master.services["qa-servicio-100"],
          scheduled_date: new Date().toISOString().slice(0, 10),
          scheduled_time: "12:00",
          status: "pending",
          customer_message: `${run.runCode} reserva persistente`,
        },
      }))).data;
      reservations = [...reservations, reservation];
    }
    selectedReservations.push(reservation);
    await entity(page, run, "reservations", reservation.id, "qa_transaction_reservation", "RESERVATION-001");
  }

  let primaryReservation = selectedReservations[0];
  const reservationPayload = {
    customer_id: primaryReservation.customer_id,
    branch_id: master.branches.one,
    preferred_barber_id: master.employees.barberOne,
    service_interest_id: master.services["qa-servicio-100"],
    scheduled_date: new Date().toISOString().slice(0, 10),
    scheduled_time: "12:00",
    source: "manual",
    channel: "reception",
    customer_message: `${run.runCode} reserva persistente`,
  };
  const reservationPath = ["pending", "contacted", "confirmed", "checked_in"];
  const currentReservationIndex = reservationPath.indexOf(primaryReservation.status);
  for (const status of reservationPath.slice(Math.max(currentReservationIndex + 1, 1))) {
    if (primaryReservation.status === "completed") break;
    primaryReservation = (await ok<{ data: Reservation }>(await page.request.put(`/api/admin/reservations/${primaryReservation.id}`, {
      data: { ...reservationPayload, status },
    }))).data;
  }
  expect(["checked_in", "completed"]).toContain(primaryReservation.status);
  await scenario(page, run, "RESERVATION-001", "reservations", "Reserva recorre pending, contacted, confirmed y checked_in.", "La reserva principal quedo En tienda y la secundaria permanece en otra sede.");

  const session = await openFreshQaSession(page.request, master.branches.one, 100, run.runCode);
  await entity(page, run, "pos_sessions", session.id, "qa_transaction_pos_session", "POS-001");

  const lastUnitStock = await ok<{ stockByBranch: Array<{ branch_id: string; stock_quantity: string }> }>(
    await page.request.get(`/api/admin/stock-movements?productId=${master.products["qa-producto-ultima-unidad"]}`),
  );
  const lastUnitCurrent = Number(lastUnitStock.stockByBranch.find((item) => item.branch_id === master.branches.one)?.stock_quantity ?? 0);
  if (lastUnitCurrent !== 1) {
    const movement = (await ok<{ data: { id: string } }>(await page.request.post("/api/admin/stock-movements", {
      data: {
        product_id: master.products["qa-producto-ultima-unidad"],
        branch_id: master.branches.one,
        movement_type: "adjustment",
        quantity: 1 - lastUnitCurrent,
        notes: `${run.runCode} baseline concurrencia ultima unidad`,
      },
    }))).data;
    await entity(page, run, "stock_movements", movement.id, "qa_concurrency_baseline", "STOCK-CONCURRENCY-001");
  }

  const invalidDigital = await page.request.post("/api/admin/pos/checkout", {
    data: salePayload({
      key: `${run.runCode}_${attemptId}_digital`, master, sessionId: session.id, customerId: selectedCustomers[0].id,
      payments: [
        { payment_method_id: master.paymentMethods.qr, amount: 100, tendered_amount: 100, change_amount: 0 },
        { payment_method_id: master.paymentMethods.card, amount: 100, tendered_amount: 100, change_amount: 0 },
      ],
    }),
  });
  expect(invalidDigital.status()).toBe(400);

  const reservationSale = (await ok<{ data: SaleResult }>(await page.request.post("/api/admin/pos/checkout", {
    data: salePayload({
      key: `${run.runCode}_${attemptId}_reservation`, master, sessionId: session.id, customerId: selectedCustomers[0].id, reservationId: primaryReservation.id,
      payments: [{ payment_method_id: master.paymentMethods.cash, amount: 150, tendered_amount: 200, change_amount: 50 }],
    }),
  }))).data;
  expect(reservationSale).toMatchObject({ total: 150, paidTotal: 150, changeAmount: 50 });
  await entity(page, run, "sales", reservationSale.saleId, "qa_sale_reservation_cash", "PAY-001");
  for (const item of reservationSale.items) await entity(page, run, "sale_items", item.id, "qa_sale_item", "PAY-001");
  for (const payment of reservationSale.payments) {
    expect(payment).toMatchObject({ amount: 150, tendered_amount: 200, change_amount: 50 });
    await entity(page, run, "sale_payments", payment.id, "qa_sale_payment", "PAY-001");
  }
  const ticket = (await ok<{ data: { totals: { payable_amount: number; change_amount: number } } }>(await page.request.get(`/api/admin/sales/${reservationSale.saleId}/ticket`))).data;
  expect(ticket.totals).toMatchObject({ payable_amount: 150, change_amount: 50 });
  const completedReservation = (await ok<{ data: Reservation }>(await page.request.get(`/api/admin/reservations/${primaryReservation.id}`))).data;
  expect(completedReservation.status).toBe("completed");
  await scenario(page, run, "PAY-001", "payments", "Efectivo aplica S/150, recibe S/200 y devuelve S/50.", "Checkout, detalle persistido y ticket coinciden.");

  const idempotencyPayload = salePayload({
    key: `${run.runCode}_${attemptId}_same`, master, sessionId: session.id, customerId: selectedCustomers[0].id,
    payments: [
      { payment_method_id: master.paymentMethods.qr, amount: 100, tendered_amount: 100, change_amount: 0 },
      { payment_method_id: master.paymentMethods.card, amount: 50, tendered_amount: 50, change_amount: 0 },
    ],
  });
  const concurrent = await Promise.all([
    page.request.post("/api/admin/pos/checkout", { data: idempotencyPayload }),
    page.request.post("/api/admin/pos/checkout", { data: idempotencyPayload }),
  ]);
  const successful = await Promise.all(concurrent.filter((response) => response.ok()).map((response) => json<{ data: SaleResult }>(response)));
  expect(successful.length).toBeGreaterThan(0);
  expect(new Set(successful.map((item) => item.data.saleId)).size).toBe(1);
  const idempotentSaleId = successful[0].data.saleId;
  const retry = (await ok<{ data: SaleResult }>(await page.request.post("/api/admin/pos/checkout", { data: idempotencyPayload }))).data;
  expect(retry.saleId).toBe(idempotentSaleId);
  const changed = await page.request.post("/api/admin/pos/checkout", {
    data: { ...idempotencyPayload, notes: `${run.runCode} payload alterado` },
  });
  expect(changed.status()).toBe(409);
  await entity(page, run, "sales", idempotentSaleId, "qa_sale_idempotent", "POS-IDEMPOTENCY-001");
  await scenario(page, run, "POS-IDEMPOTENCY-001", "pos", "Dos requests y retry producen una venta; payload distinto devuelve 409.", "Una venta persistida y conflicto explicito para firma distinta.");

  const lastUnitItems = [{ item_type: "product", catalog_id: master.products["qa-producto-ultima-unidad"], quantity: 1, unit_price: 50, discount_amount: 0, is_courtesy: false }];
  const lastUnitRequests = ["a", "b"].map((suffix) => page.request.post("/api/admin/pos/checkout", {
    data: salePayload({
      key: `${run.runCode}_${attemptId}_last_${suffix}`, master, sessionId: session.id, customerId: selectedCustomers[0].id, items: lastUnitItems,
      payments: [{ payment_method_id: master.paymentMethods.cash, amount: 50, tendered_amount: 50, change_amount: 0 }],
    }),
  }));
  const lastUnitResponses = await Promise.all(lastUnitRequests);
  expect(lastUnitResponses.filter((response) => response.ok())).toHaveLength(1);
  expect(lastUnitResponses.filter((response) => !response.ok())).toHaveLength(1);
  const lastUnitSale = await json<{ data: SaleResult }>(lastUnitResponses.find((response) => response.ok())!);
  await entity(page, run, "sales", lastUnitSale.data.saleId, "qa_sale_last_unit", "STOCK-CONCURRENCY-001");
  const stock = await ok<{ stockByBranch: Array<{ branch_id: string; stock_quantity: string }> }>(await page.request.get(`/api/admin/stock-movements?productId=${master.products["qa-producto-ultima-unidad"]}`));
  expect(Number(stock.stockByBranch.find((item) => item.branch_id === master.branches.one)?.stock_quantity)).toBe(0);
  await scenario(page, run, "STOCK-CONCURRENCY-001", "stock", "Dos ventas compiten por una unidad: una gana y stock final cero.", "Una respuesta correcta, una rechazada y stock nunca negativo.");

  let reasons = (await ok<{ data: Array<{ id: string }> }>(await page.request.get("/api/admin/sale-cancellation-reasons"))).data;
  if (reasons.length === 0) {
    const reason = (await ok<{ data: { id: string } }>(await page.request.post("/api/admin/sale-cancellation-reasons", {
      data: { code: "qa_error_operativo", name: "QA Error operativo", description: "QA_TEST_DATA motivo persistente", sort_order: 900 },
    }))).data;
    reasons = [reason];
    await finding(page, run, {
      findingCode: "QA-016",
      severity: "P2",
      module: "sales",
      title: "Catalogo de motivos de anulacion vacio",
      status: "verified",
      expectedResult: "Existe al menos un motivo activo para anular.",
      actualResult: "El motivo QA persistente fue creado por una API administrativa.",
      rootCause: "El entorno desplegado no contenia los seeds del catalogo.",
      fixSummary: "Alta administrativa idempotente de motivos de anulacion.",
      regressionResult: "La anulacion concurrente puede continuar.",
    });
  }
  await entity(page, run, "sale_cancellation_reasons", reasons[0].id, "qa_master_cancellation_reason", "CANCEL-CONCURRENCY-001");
  const cancellationResponses = await Promise.all([
    page.request.post(`/api/admin/pos/sales/${reservationSale.saleId}/cancel`, { data: { reasonId: reasons[0].id, notes: `${run.runCode} anulacion concurrente` } }),
    page.request.post(`/api/admin/pos/sales/${reservationSale.saleId}/cancel`, { data: { reasonId: reasons[0].id, notes: `${run.runCode} anulacion concurrente` } }),
  ]);
  expect(cancellationResponses.filter((response) => response.ok())).toHaveLength(1);
  const cancelledDetail = (await ok<{ data: { status: string } }>(await page.request.get(`/api/admin/sales/${reservationSale.saleId}`))).data;
  expect(cancelledDetail.status).toBe("cancelled");
  const reopenedReservation = (await ok<{ data: Reservation }>(await page.request.get(`/api/admin/reservations/${primaryReservation.id}`))).data;
  expect(reopenedReservation.status).toBe("checked_in");
  await scenario(page, run, "CANCEL-CONCURRENCY-001", "sales", "Dos anulaciones producen una sola reversa y reabren reserva.", "Una anulacion efectiva; venta anulada y reserva nuevamente En tienda.");

  await writeFile(flowPath, JSON.stringify({
    customers: selectedCustomers.map((item) => item.id),
    reservations: selectedReservations.map((item) => item.id),
    sessionId: session.id,
    sales: { reservationCash: reservationSale.saleId, idempotent: idempotentSaleId, lastUnit: lastUnitSale.data.saleId },
  }, null, 2), "utf8");
});
