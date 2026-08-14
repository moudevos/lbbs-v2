import { expect, test, type APIResponse, type Page } from "@playwright/test";

import {
  highlightLocator,
  installVisualCursor,
  removeQaScenarioBanner,
  showQaScenarioBanner,
  visualPause,
} from "./helpers/visual-cursor";

type QaBranch = { id: string; name: string };
type QaEmployee = { id: string; full_name: string };
type QaCustomer = { id: string; full_name: string };
type QaCatalogItem = { id: string; name: string; base_price?: string; base_sale_price?: string };
type PaymentMethod = {
  id: string;
  code: string;
  name: string;
  payment_kind: "cash" | "wallet_qr" | "card" | "bank_transfer" | "other_digital";
  allows_change: boolean;
  is_active: boolean;
};
type QaSession = { id: string; branch_id: string; status: string };

const ownerCredentials = (() => {
  const email = process.env.QA_EMAIL;
  const password = process.env.QA_PASSWORD;

  if (!email || !password) {
    throw new Error("Faltan QA_EMAIL o QA_PASSWORD para la iteracion 7.");
  }

  return { email, password };
})();

const runId = crypto.randomUUID().slice(0, 8);
const marker = `QA_TEST_DATA ${runId}`;
const scenarioTimeout = process.env.QA_VISUAL === "true" ? 150_000 : 90_000;

let branch: QaBranch | null = null;
let barber: QaEmployee | null = null;
let customer: QaCustomer | null = null;
let service: QaCatalogItem | null = null;
let product: QaCatalogItem | null = null;
let posSession: QaSession | null = null;
let cashMethod: PaymentMethod | null = null;
let qrMethod: PaymentMethod | null = null;
let cardMethod: PaymentMethod | null = null;
let completedSaleId: string | null = null;

async function readJson<T>(response: APIResponse): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`La API devolvio una respuesta no JSON (${response.status()}).`);
  }
}

async function expectOk<T>(response: APIResponse): Promise<T> {
  const payload = await readJson<T & { error?: string }>(response);
  expect(response.ok(), payload.error ?? `La API respondio ${response.status()}.`).toBe(true);
  return payload;
}

async function expectError(response: APIResponse, expectedMessage: string) {
  const payload = await readJson<{ error?: string }>(response);
  expect(response.ok()).toBe(false);
  expect(payload.error).toBe(expectedMessage);
}

async function login(page: Page) {
  await installVisualCursor(page);
  await page.goto("/login");
  const email = page.getByLabel("Email");
  const submit = page.getByRole("button", { name: "Ingresar" });
  await highlightLocator(email);
  await email.fill(ownerCredentials.email);
  await page.getByLabel("Password").fill(ownerCredentials.password);
  await highlightLocator(submit);
  await submit.click();
  await page.waitForURL(/\/control$/, { timeout: 15_000 });
  await visualPause(page);
}

function checkoutPayload(options: {
  payments: Array<{ payment_method_id: string; amount: number; tendered_amount: number; change_amount: number }>;
}) {
  if (!branch || !barber || !customer || !service || !product || !posSession) {
    throw new Error("Los datos QA del POS no estan preparados.");
  }

  return {
    idempotency_key: crypto.randomUUID(),
    pos_session_id: posSession.id,
    branch_id: branch.id,
    customer_id: customer.id,
    barber_id: barber.id,
    notes: `${marker} Venta POS`,
    items: [
      {
        item_type: "service",
        catalog_id: service.id,
        quantity: 1,
        unit_price: 100,
        discount_amount: 0,
        is_courtesy: false,
      },
      {
        item_type: "product",
        catalog_id: product.id,
        quantity: 1,
        unit_price: 50,
        discount_amount: 0,
        is_courtesy: false,
      },
    ],
    payments: options.payments,
  };
}

async function getQaSales(page: Page) {
  if (!branch) {
    throw new Error("Falta la sede QA.");
  }
  const response = await page.request.get(`/api/admin/sales?branchId=${branch.id}`);
  const payload = await expectOk<{ data: Array<{ id: string; status: string; total: number; paidTotal: number; changeAmount: number }> }>(response);
  return payload.data.filter((sale) => sale.id === completedSaleId || sale.status === "draft");
}

test.describe.serial("iteracion 7: POS y pagos reales", () => {
  test("owner prepara datos QA y abre una sesion POS operativa", async ({ page }) => {
    test.setTimeout(scenarioTimeout);
    await login(page);
    await showQaScenarioBanner(page, {
      scenario: "POS real: preparacion y catalogo",
      role: "Owner",
      branch: "SED-001 QA",
      step: "1 de 4",
    });

    const branchResponse = await page.request.post("/api/admin/branches", {
      data: {
        code: `SED-001-QA-${runId}`,
        slug: `sed-001-qa-${runId}`,
        name: `${marker} Sede Uno`,
        notes: marker,
      },
    });
    branch = (await expectOk<{ data: QaBranch }>(branchResponse)).data;

    const barberResponse = await page.request.post("/api/admin/employees", {
      data: {
        full_name: `${marker} Barbero Uno`,
        email: `qa-${runId}-barber@example.invalid`,
        role: "barber",
        branch_id: branch.id,
        can_login: false,
        notes: marker,
      },
    });
    barber = (await expectOk<{ data: QaEmployee }>(barberResponse)).data;

    const customerResponse = await page.request.post("/api/admin/customers", {
      data: {
        first_name: marker,
        last_name: "Cliente Principal",
        phone: `9${Date.now().toString().slice(-8)}`,
        document_type: "DNI",
        document_number: `8${Date.now().toString().slice(-7)}`,
        notes: marker,
      },
    });
    customer = (await expectOk<{ data: QaCustomer }>(customerResponse)).data;

    const serviceResponse = await page.request.post("/api/admin/services", {
      data: {
        name: `${marker} Servicio S/100`,
        slug: `qa-${runId}-servicio-100`,
        base_price: 100,
        duration_minutes: 30,
        description: marker,
      },
    });
    service = (await expectOk<{ data: QaCatalogItem }>(serviceResponse)).data;

    const productResponse = await page.request.post("/api/admin/products", {
      data: {
        name: `${marker} Producto S/50`,
        slug: `qa-${runId}-producto-50`,
        sku: `QA-${runId}-50`,
        unit: "unidad",
        cost_price: 20,
        base_sale_price: 50,
        is_stockable: true,
        description: marker,
      },
    });
    product = (await expectOk<{ data: QaCatalogItem }>(productResponse)).data;

    const stockResponse = await page.request.post("/api/admin/stock-movements", {
      data: {
        product_id: product.id,
        branch_id: branch.id,
        movement_type: "adjustment",
        quantity: 5,
        notes: marker,
      },
    });
    await expectOk(stockResponse);

    const paymentDefinitions = [
      { code: `qa_${runId}_cash`, name: `${marker} Efectivo`, payment_kind: "cash" },
      { code: `qa_${runId}_qr`, name: `${marker} QR`, payment_kind: "wallet_qr" },
      { code: `qa_${runId}_card`, name: `${marker} Tarjeta`, payment_kind: "card" },
    ] as const;
    const paymentMethods = await Promise.all(
      paymentDefinitions.map(async (definition) => {
        const response = await page.request.post("/api/admin/payment-methods", {
          data: { ...definition, description: marker },
        });
        return (await expectOk<{ data: PaymentMethod }>(response)).data;
      }),
    );
    cashMethod = paymentMethods.find((method) => method.payment_kind === "cash") ?? null;
    qrMethod = paymentMethods.find((method) => method.payment_kind === "wallet_qr") ?? null;
    cardMethod = paymentMethods.find((method) => method.payment_kind === "card") ?? null;
    expect(cashMethod?.allows_change).toBe(true);
    expect(qrMethod?.allows_change).toBe(false);
    expect(cardMethod?.allows_change).toBe(false);

    const sessionResponse = await page.request.post("/api/admin/pos/sessions/open", {
      data: {
        branch_id: branch.id,
        opening_cash_amount: 50,
        notes: marker,
      },
    });
    posSession = (await expectOk<{ data: QaSession }>(sessionResponse)).data;
    expect(posSession.status).toBe("open");

    await page.goto(`/pos?session_id=${posSession.id}`);
    await expect(page.getByText(service.name)).toBeVisible();
    await expect(page.getByText(product.name)).toBeVisible();
    await visualPause(page);
  });

  test("completa una venta de S/150, genera ticket y conserva el detalle", async ({ page }) => {
    test.setTimeout(scenarioTimeout);
    expect(cashMethod).not.toBeNull();
    await login(page);
    await showQaScenarioBanner(page, {
      scenario: "POS real: venta en efectivo con vuelto",
      role: "Owner",
      branch: "SED-001 QA",
      step: "2 de 4",
    });

    const response = await page.request.post("/api/admin/pos/checkout", {
      data: checkoutPayload({
        payments: [
          {
            payment_method_id: cashMethod!.id,
            amount: 150,
            tendered_amount: 200,
            change_amount: 50,
          },
        ],
      }),
    });
    const payload = await expectOk<{
      data: { saleId: string; total: number; paidTotal: number; changeAmount: number; items: unknown[] };
    }>(response);
    completedSaleId = payload.data.saleId;
    expect(payload.data.total).toBe(150);
    expect(payload.data.paidTotal).toBe(150);
    expect(payload.data.changeAmount).toBe(50);
    expect(payload.data.items).toHaveLength(2);

    const detailResponse = await page.request.get(`/api/admin/sales/${completedSaleId}`);
    const detail = await expectOk<{
      data: { status: string; total: number; paidTotal: number; changeAmount: number; items: unknown[]; payments: unknown[] };
    }>(detailResponse);
    expect(detail.data).toMatchObject({
      status: "completed",
      total: 150,
      paidTotal: 150,
      changeAmount: 50,
    });
    expect(detail.data.items).toHaveLength(2);
    expect(detail.data.payments).toHaveLength(1);

    const ticketResponse = await page.request.get(`/api/admin/sales/${completedSaleId}/ticket`);
    const ticket = await expectOk<{ data: { totals: { payable_amount: number; change_amount: number }; payments: unknown[] } }>(ticketResponse);
    expect(ticket.data.totals).toMatchObject({ payable_amount: 150, change_amount: 50 });
    expect(ticket.data.payments).toHaveLength(1);
  });

  test("bloquea manipular vuelto digital y no conserva borradores por exceso digital", async ({ page }) => {
    test.setTimeout(scenarioTimeout);
    expect(qrMethod).not.toBeNull();
    expect(cardMethod).not.toBeNull();
    await login(page);
    await showQaScenarioBanner(page, {
      scenario: "POS real: validacion de pagos digitales",
      role: "Owner",
      branch: "SED-001 QA",
      step: "3 de 4",
    });

    const invalidChange = await page.request.post("/api/admin/pos/checkout", {
      data: checkoutPayload({
        payments: [
          {
            payment_method_id: cardMethod!.id,
            amount: 150,
            tendered_amount: 150,
            change_amount: 1,
          },
        ],
      }),
    });
    expect(invalidChange.status()).toBe(400);

    const digitalOverpayment = await page.request.post("/api/admin/pos/checkout", {
      data: checkoutPayload({
        payments: [
          {
            payment_method_id: qrMethod!.id,
            amount: 100,
            tendered_amount: 100,
            change_amount: 0,
          },
          {
            payment_method_id: cardMethod!.id,
            amount: 100,
            tendered_amount: 100,
            change_amount: 0,
          },
        ],
      }),
    });
    expect(digitalOverpayment.status()).toBe(400);

    const sales = await getQaSales(page);
    expect(sales.filter((sale) => sale.status === "draft")).toHaveLength(0);
    expect(sales.filter((sale) => sale.status === "completed")).toHaveLength(1);
  });

  test("acepta QR mas efectivo y registra el vuelto solo en efectivo", async ({ page }) => {
    test.setTimeout(scenarioTimeout);
    expect(cashMethod).not.toBeNull();
    expect(qrMethod).not.toBeNull();
    await login(page);
    await showQaScenarioBanner(page, {
      scenario: "POS real: pago mixto QR y efectivo",
      role: "Owner",
      branch: "SED-001 QA",
      step: "4 de 4",
    });

    const response = await page.request.post("/api/admin/pos/checkout", {
      data: checkoutPayload({
        payments: [
          {
            payment_method_id: qrMethod!.id,
            amount: 100,
            tendered_amount: 100,
            change_amount: 0,
          },
          {
            payment_method_id: cashMethod!.id,
            amount: 50,
            tendered_amount: 100,
            change_amount: 50,
          },
        ],
      }),
    });
    const payload = await expectOk<{
      data: { saleId: string; total: number; paidTotal: number; changeAmount: number; payments: Array<{ amount: number; tendered_amount: number; change_amount: number }> };
    }>(response);
    expect(payload.data).toMatchObject({ total: 150, paidTotal: 150, changeAmount: 50 });
    expect(payload.data.payments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ amount: 100, tendered_amount: 100, change_amount: 0 }),
        expect.objectContaining({ amount: 50, tendered_amount: 100, change_amount: 50 }),
      ]),
    );

    await visualPause(page);
  });

  test("no duplica una venta cuando el mismo checkout llega en paralelo", async ({ page }) => {
    test.setTimeout(scenarioTimeout);
    expect(cashMethod).not.toBeNull();
    await login(page);

    const payload = {
      ...checkoutPayload({
        payments: [
          {
            payment_method_id: cashMethod!.id,
            amount: 150,
            tendered_amount: 150,
            change_amount: 0,
          },
        ],
      }),
      idempotency_key: `qa-${runId}-checkout-concurrent`,
    };

    const responses = await Promise.all([
      page.request.post("/api/admin/pos/checkout", { data: payload }),
      page.request.post("/api/admin/pos/checkout", { data: payload }),
    ]);
    const responseBodies = await Promise.all(
      responses.map(async (response) => ({
        status: response.status(),
        body: (await response.json()) as { data?: { saleId?: string } },
      })),
    );
    const successfulSaleIds = responseBodies
      .filter((response) => response.status === 200)
      .map((response) => response.body.data?.saleId)
      .filter((saleId): saleId is string => Boolean(saleId));

    expect(successfulSaleIds.length).toBeGreaterThanOrEqual(1);
    expect(new Set(successfulSaleIds).size).toBe(1);
    expect(responseBodies.every((response) => response.status === 200 || response.status === 409)).toBeTruthy();

    const retryResponse = await page.request.post("/api/admin/pos/checkout", { data: payload });
    const retryPayload = await expectOk<{ data: { saleId: string } }>(retryResponse);
    expect(retryPayload.data.saleId).toBe(successfulSaleIds[0]);

    const changedPayloadResponse = await page.request.post("/api/admin/pos/checkout", {
      data: {
        ...payload,
        payments: [
          {
            payment_method_id: cashMethod!.id,
            amount: 149,
            tendered_amount: 149,
            change_amount: 0,
          },
        ],
      },
    });
    expect(changedPayloadResponse.status()).toBe(409);
    await expectError(changedPayloadResponse, "La clave de cierre ya fue usada con datos diferentes.");

    if (!branch) {
      throw new Error("Falta la sede QA.");
    }
    const salesResponse = await page.request.get(`/api/admin/sales?branchId=${branch.id}`);
    const salesPayload = await expectOk<{ data: Array<{ status: string }> }>(salesResponse);
    expect(salesPayload.data.filter((sale) => sale.status === "completed")).toHaveLength(3);
  });

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({ baseURL: "http://127.0.0.1:3100" });
    const page = await context.newPage();
    await login(page);
    const response = await page.request.post("/api/admin/qa/cleanup-operational", { data: { runId } });
    await expectOk(response);
    await removeQaScenarioBanner(page);
    await context.close();
  });
});
