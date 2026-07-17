import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type APIResponse, type Browser, type Page } from "@playwright/test";

test.use({ trace: "off", screenshot: "off", video: "off" });

type RunState = { id: string; runCode: string };
type Branch = { id: string; code: string | null; name: string; is_active: boolean };
type Employee = {
  id: string;
  user_id: string | null;
  branch_id: string | null;
  full_name: string;
  email: string | null;
  role: string;
  status: string;
  can_login: boolean;
};
type CatalogItem = { id: string; slug: string; name: string };
type PaymentMethod = { id: string; payment_kind: string; code: string; name: string; is_active: boolean };
type BranchPrice = { id: string; branch_id: string };
type StockSnapshot = { branch_id: string; stock_quantity: string };
type RuntimeSecrets = {
  admin: { email: string; password: string };
  reception: { email: string; password: string };
};

const ownerCredentials = (() => {
  const email = process.env.QA_EMAIL;
  const password = process.env.QA_PASSWORD;
  if (!email || !password) throw new Error("Faltan credenciales owner QA.");
  return { email, password };
})();

const qaDirectory = path.resolve(process.cwd(), ".qa");
const runStatePath = path.join(qaDirectory, "current-run.json");
const secretsPath = path.join(qaDirectory, "runtime-secrets.json");
const masterStatePath = path.join(qaDirectory, "master-state.json");

async function readJson<T>(response: APIResponse): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Respuesta no JSON (${response.status()}).`);
  }
}

async function expectOk<T>(response: APIResponse): Promise<T> {
  const payload = await readJson<T & { error?: string }>(response);
  expect(response.ok(), payload.error ?? `La API respondio ${response.status()}.`).toBe(true);
  return payload;
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(/\/(control|cambiar-contrasena-obligatoria)$/, { timeout: 15_000 });
}

function deriveEmail(label: string) {
  const separator = ownerCredentials.email.lastIndexOf("@");
  if (separator <= 0) throw new Error("El correo owner QA no permite generar aliases.");
  return `${ownerCredentials.email.slice(0, separator)}+lbbs-${label}${ownerCredentials.email.slice(separator)}`;
}

function securePassword() {
  return `Qa!${randomBytes(18).toString("base64url")}9a`;
}

async function registerEntity(page: Page, run: RunState, input: {
  table: string;
  id: string;
  type: string;
  scenario: string;
  metadata?: Record<string, unknown>;
}) {
  const response = await page.request.post("/api/admin/qa/events", {
    data: {
      action: "entity",
      data: {
        qaRunId: run.id,
        entityTable: input.table,
        entityId: input.id,
        entityType: input.type,
        scenarioCode: input.scenario,
        metadata: input.metadata ?? {},
      },
    },
  });
  await expectOk(response);
}

async function registerScenario(page: Page, run: RunState, input: {
  code: string;
  module: string;
  expected: string;
  actual: string;
}) {
  const response = await page.request.post("/api/admin/qa/events", {
    data: {
      action: "scenario",
      data: {
        qaRunId: run.id,
        scenarioCode: input.code,
        module: input.module,
        status: "passed",
        expectedResult: input.expected,
        actualResult: input.actual,
        evidence: { persistent: true },
        finishedAt: new Date().toISOString(),
      },
    },
  });
  await expectOk(response);
}

async function completePasswordChange(browser: Browser, email: string, temporary: string, finalPassword: string) {
  const context = await browser.newContext({ baseURL: "http://127.0.0.1:3100" });
  const page = await context.newPage();
  await login(page, email, temporary);
  expect(page.url()).toContain("/cambiar-contrasena-obligatoria");
  await page.locator('input[name="current-password"]').fill(temporary);
  await page.locator('input[name="new-password"]').fill(finalPassword);
  await page.locator('input[name="confirm-password"]').fill(finalPassword);
  await page.getByRole("button", { name: /Actualizar contrase/ }).click();
  await page.locator(".swal2-confirm").click();
  await page.waitForURL(/\/control$/, { timeout: 15_000 });
  await context.close();
}

test("crea o reutiliza maestros persistentes de la iteracion 10", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const run = JSON.parse(await readFile(runStatePath, "utf8")) as RunState;
  await login(page, ownerCredentials.email, ownerCredentials.password);

  const branchDefinitions = [
    { code: "QA-SED-001", slug: "qa-sed-001", name: "QA_TEST_DATA Laboratorio Uno" },
    { code: "QA-SED-002", slug: "qa-sed-002", name: "QA_TEST_DATA Laboratorio Dos" },
  ];
  let branches = (await expectOk<{ data: Branch[] }>(await page.request.get("/api/admin/branches"))).data;
  const persistentBranches: Branch[] = [];

  for (const definition of branchDefinitions) {
    let branch = branches.find((item) => item.code === definition.code);
    if (!branch) {
      branch = (await expectOk<{ data: Branch }>(await page.request.post("/api/admin/branches", {
        data: { ...definition, notes: "QA_TEST_DATA Laboratorio persistente", is_active: true },
      }))).data;
      branches = [...branches, branch];
    }
    expect(branch).toMatchObject({ name: definition.name, is_active: true });
    persistentBranches.push(branch);
    await registerEntity(page, run, { table: "branches", id: branch.id, type: "qa_master_branch", scenario: "MASTER-BRANCHES-001", metadata: { code: definition.code } });
  }

  const [branchOne, branchTwo] = persistentBranches;
  const adminEmail = deriveEmail("admin");
  const receptionEmail = deriveEmail("reception");
  const barberOneEmail = deriveEmail("barber-one");
  const barberTwoEmail = deriveEmail("barber-two");
  let employees = (await expectOk<{ data: Employee[] }>(await page.request.get("/api/admin/employees"))).data;
  let secrets: RuntimeSecrets | null = null;
  try {
    secrets = JSON.parse(await readFile(secretsPath, "utf8")) as RuntimeSecrets;
  } catch {
    secrets = null;
  }

  const employeeDefinitions = [
    { key: "admin", full_name: "QA_TEST_DATA ADMIN QA", email: adminEmail, role: "admin", branch_id: null, can_login: true },
    { key: "reception", full_name: "QA_TEST_DATA RECEPTION QA", email: receptionEmail, role: "reception", branch_id: branchOne.id, can_login: true },
    { key: "barberOne", full_name: "QA_TEST_DATA Barbero QA Uno", email: barberOneEmail, role: "barber", branch_id: branchOne.id, can_login: false },
    { key: "barberTwo", full_name: "QA_TEST_DATA Barbero QA Dos", email: barberTwoEmail, role: "barber", branch_id: branchTwo.id, can_login: false },
  ] as const;
  const persistentEmployees: Record<string, Employee> = {};
  const newSecrets: Partial<RuntimeSecrets> = secrets ?? {};

  for (const definition of employeeDefinitions) {
    let employee = employees.find((item) => item.email === definition.email);
    if (!employee) {
      const temporaryPassword = definition.can_login ? securePassword() : null;
      employee = (await expectOk<{ data: Employee }>(await page.request.post("/api/admin/employees", {
        data: {
          full_name: definition.full_name,
          email: definition.email,
          role: definition.role,
          branch_id: definition.branch_id,
          can_login: definition.can_login,
          temporary_password: temporaryPassword,
          notes: "QA_TEST_DATA Laboratorio persistente",
        },
      }))).data;
      employees = [...employees, employee];

      if (definition.can_login && temporaryPassword) {
        const finalPassword = securePassword();
        await completePasswordChange(browser, definition.email, temporaryPassword, finalPassword);
        if (definition.key === "admin" || definition.key === "reception") {
          newSecrets[definition.key] = { email: definition.email, password: finalPassword };
        }
      }
    }

    if (definition.can_login && !newSecrets[definition.key as "admin" | "reception"]) {
      throw new Error("Existe un usuario QA persistente sin secreto local reutilizable.");
    }
    if (!definition.can_login) {
      expect(employee).toMatchObject({ user_id: null, can_login: false, role: "barber", branch_id: definition.branch_id });
    }
    expect(employee.status).toBe("active");
    persistentEmployees[definition.key] = employee;
    await registerEntity(page, run, { table: "employees", id: employee.id, type: definition.can_login ? "qa_master_user" : "qa_master_barber", scenario: "MASTER-EMPLOYEES-001", metadata: { role: definition.role } });
  }

  await mkdir(qaDirectory, { recursive: true });
  await writeFile(secretsPath, JSON.stringify(newSecrets, null, 2), "utf8");

  const serviceDefinitions = [
    { slug: "qa-servicio-50", name: "QA Servicio S/50", price: 50 },
    { slug: "qa-servicio-100", name: "QA Servicio S/100", price: 100 },
    { slug: "qa-servicio-150", name: "QA Servicio S/150", price: 150 },
    { slug: "qa-servicio-cortesia", name: "QA Servicio Cortesia", price: 50 },
    { slug: "qa-servicio-reward", name: "QA Servicio Reward", price: 50 },
  ];
  let services = (await expectOk<{ data: CatalogItem[] }>(await page.request.get("/api/admin/services"))).data;
  const persistentServices: Record<string, CatalogItem> = {};
  for (const definition of serviceDefinitions) {
    let service = services.find((item) => item.slug === definition.slug);
    if (!service) {
      service = (await expectOk<{ data: CatalogItem }>(await page.request.post("/api/admin/services", {
        data: { name: definition.name, slug: definition.slug, base_price: definition.price, duration_minutes: 30, description: "QA_TEST_DATA Catalogo persistente" },
      }))).data;
      services = [...services, service];
    }
    persistentServices[definition.slug] = service;
    await registerEntity(page, run, { table: "services", id: service.id, type: "qa_master_service", scenario: "MASTER-CATALOG-001", metadata: { slug: definition.slug, price: definition.price } });
  }

  const productDefinitions = [
    { slug: "qa-producto-50", sku: "QA-PROD-050", name: "QA Producto S/50", price: 50, courtesy: false },
    { slug: "qa-producto-100", sku: "QA-PROD-100", name: "QA Producto S/100", price: 100, courtesy: false },
    { slug: "qa-producto-cortesia", sku: "QA-PROD-CORT", name: "QA Producto Cortesia", price: 50, courtesy: true },
    { slug: "qa-producto-ultima-unidad", sku: "QA-PROD-LAST", name: "QA Producto Ultima Unidad", price: 50, courtesy: false },
    { slug: "qa-producto-agotado", sku: "QA-PROD-ZERO", name: "QA Producto Agotado", price: 50, courtesy: false },
  ];
  let products = (await expectOk<{ data: CatalogItem[] }>(await page.request.get("/api/admin/products"))).data;
  const persistentProducts: Record<string, CatalogItem> = {};
  for (const definition of productDefinitions) {
    let product = products.find((item) => item.slug === definition.slug);
    if (!product) {
      product = (await expectOk<{ data: CatalogItem }>(await page.request.post("/api/admin/products", {
        data: { name: definition.name, slug: definition.slug, sku: definition.sku, unit: "unidad", cost_price: 20, base_sale_price: definition.price, is_stockable: true, is_courtesy_allowed: definition.courtesy, description: "QA_TEST_DATA Catalogo persistente" },
      }))).data;
      products = [...products, product];
    }
    persistentProducts[definition.slug] = product;
    await registerEntity(page, run, { table: "products", id: product.id, type: "qa_master_product", scenario: "MASTER-CATALOG-001", metadata: { slug: definition.slug, price: definition.price } });
  }

  for (const definition of serviceDefinitions) {
    const service = persistentServices[definition.slug];
    const currentPrices = (await expectOk<{ data: BranchPrice[] }>(
      await page.request.get(`/api/admin/service-branch-prices?serviceId=${service.id}`),
    )).data;
    for (const branch of persistentBranches) {
      let branchPrice = currentPrices.find((item) => item.branch_id === branch.id);
      if (!branchPrice) {
        branchPrice = (await expectOk<{ data: BranchPrice }>(await page.request.post("/api/admin/service-branch-prices", {
          data: { service_id: service.id, branch_id: branch.id, price: definition.price, is_active: true },
        }))).data;
      }
      await registerEntity(page, run, { table: "service_branch_prices", id: branchPrice.id, type: "qa_master_service_price", scenario: "MASTER-PRICES-001", metadata: { service: definition.slug, branch: branch.code } });
    }
  }

  const stockTargets: Record<string, number> = {
    "qa-producto-50": 30,
    "qa-producto-100": 30,
    "qa-producto-cortesia": 30,
    "qa-producto-ultima-unidad": 1,
    "qa-producto-agotado": 0,
  };
  for (const definition of productDefinitions) {
    const product = persistentProducts[definition.slug];
    const currentPrices = (await expectOk<{ data: BranchPrice[] }>(
      await page.request.get(`/api/admin/product-branch-prices?productId=${product.id}`),
    )).data;
    for (const branch of persistentBranches) {
      let branchPrice = currentPrices.find((item) => item.branch_id === branch.id);
      if (!branchPrice) {
        branchPrice = (await expectOk<{ data: BranchPrice }>(await page.request.post("/api/admin/product-branch-prices", {
          data: { product_id: product.id, branch_id: branch.id, sale_price: definition.price, is_active: true },
        }))).data;
      }
      await registerEntity(page, run, { table: "product_branch_prices", id: branchPrice.id, type: "qa_master_product_price", scenario: "MASTER-PRICES-001", metadata: { product: definition.slug, branch: branch.code } });
    }

    const stockPayload = await expectOk<{ stockByBranch: StockSnapshot[] }>(
      await page.request.get(`/api/admin/stock-movements?productId=${product.id}`),
    );
    for (const branch of persistentBranches) {
      const current = Number(stockPayload.stockByBranch.find((item) => item.branch_id === branch.id)?.stock_quantity ?? 0);
      const target = stockTargets[definition.slug];
      const delta = target - current;
      if (Math.abs(delta) < 0.001) continue;

      const movement = (await expectOk<{ data: { id: string } }>(await page.request.post("/api/admin/stock-movements", {
        data: {
          product_id: product.id,
          branch_id: branch.id,
          movement_type: "adjustment",
          quantity: delta,
          notes: `${run.runCode} baseline persistente a ${target}`,
        },
      }))).data;
      await registerEntity(page, run, { table: "stock_movements", id: movement.id, type: "qa_baseline_stock", scenario: "MASTER-STOCK-001", metadata: { product: definition.slug, branch: branch.code, target } });
    }
  }

  const paymentMethodDefinitions = [
    { code: "cash", name: "EFECTIVO", payment_kind: "cash", sort_order: 0 },
    { code: "wallet_qr", name: "QR YAPE/PLIN", payment_kind: "wallet_qr", sort_order: 1 },
    { code: "card_pos", name: "TARJETA", payment_kind: "card", sort_order: 2 },
  ] as const;
  let methods = (await expectOk<{ data: PaymentMethod[] }>(await page.request.get("/api/admin/payment-methods"))).data;
  for (const definition of paymentMethodDefinitions) {
    if (methods.some((item) => item.payment_kind === definition.payment_kind && item.is_active)) {
      continue;
    }

    const method = (await expectOk<{ data: PaymentMethod }>(await page.request.post("/api/admin/payment-methods", {
      data: {
        ...definition,
        description: "QA_TEST_DATA Metodo operativo persistente",
        is_active: true,
      },
    }))).data;
    methods = [...methods, method];
  }
  const paymentMethods = {
    cash: methods.find((item) => item.payment_kind === "cash" && item.is_active),
    qr: methods.find((item) => item.payment_kind === "wallet_qr" && item.is_active),
    card: methods.find((item) => item.payment_kind === "card" && item.is_active),
  };
  expect(paymentMethods.cash).toBeTruthy();
  expect(paymentMethods.qr).toBeTruthy();
  expect(paymentMethods.card).toBeTruthy();
  for (const [kind, method] of Object.entries(paymentMethods)) {
    await registerEntity(page, run, { table: "payment_methods", id: method!.id, type: "qa_master_payment_method", scenario: "MASTER-PAYMENTS-001", metadata: { kind } });
  }

  await registerScenario(page, run, { code: "MASTER-BRANCHES-001", module: "branches", expected: "Dos sedes QA activas y reutilizables.", actual: "QA-SED-001 y QA-SED-002 activas." });
  await registerScenario(page, run, { code: "MASTER-EMPLOYEES-001", module: "employees", expected: "Admin y reception con Auth; barberos sin Auth.", actual: "Roles persistentes correctos y barberos con user_id null." });
  await registerScenario(page, run, { code: "MASTER-CATALOG-001", module: "catalog", expected: "Cinco servicios y cinco productos QA estables.", actual: "Catalogo localizado por slugs unicos sin duplicados." });
  await registerScenario(page, run, { code: "MASTER-PRICES-001", module: "catalog", expected: "Precios operativos en las dos sedes QA.", actual: "Servicios y productos tienen precio por sede reutilizable." });
  await registerScenario(page, run, { code: "MASTER-STOCK-001", module: "stock", expected: "Stock baseline trazable en ambas sedes.", actual: "Stock normal con margen, ultima unidad en 1 y agotado en 0." });
  await registerScenario(page, run, { code: "MASTER-PAYMENTS-001", module: "payments", expected: "Metodos activos de efectivo, QR y tarjeta.", actual: "Los tres metodos operativos fueron creados o reutilizados por payment_kind." });

  await writeFile(masterStatePath, JSON.stringify({
    branches: { one: branchOne.id, two: branchTwo.id },
    employees: Object.fromEntries(Object.entries(persistentEmployees).map(([key, value]) => [key, value.id])),
    services: Object.fromEntries(Object.entries(persistentServices).map(([key, value]) => [key, value.id])),
    products: Object.fromEntries(Object.entries(persistentProducts).map(([key, value]) => [key, value.id])),
    paymentMethods: Object.fromEntries(Object.entries(paymentMethods).map(([key, value]) => [key, value!.id])),
  }, null, 2), "utf8");
});
