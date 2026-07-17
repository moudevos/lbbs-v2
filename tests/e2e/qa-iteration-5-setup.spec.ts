import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, rmSync } from "node:fs";

import {
  highlightLocator,
  installVisualCursor,
  removeQaScenarioBanner,
  showQaScenarioBanner,
  visualPause,
} from "./helpers/visual-cursor";

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

const ownerCredentials = (() => {
  const email = process.env.QA_EMAIL;
  const password = process.env.QA_PASSWORD;

  if (!email || !password) {
    throw new Error("Faltan QA_EMAIL o QA_PASSWORD para la iteracion 5.");
  }

  return { email, password };
})();

const runId = crypto.randomUUID().slice(0, 8);
const temporaryPassword = `Qa#${crypto.randomUUID().slice(0, 12)}a`;
const nextPassword = `Qa#${crypto.randomUUID().slice(0, 12)}b`;
const qa = {
  adminEmail: `qa-admin-${runId}@example.invalid`,
  receptionEmail: `qa-reception-${runId}@example.invalid`,
};
const scenarioTimeout = process.env.QA_VISUAL === "true" ? 120_000 : 90_000;

let sedOne: Branch | null = null;
let sedTwo: Branch | null = null;
let adminQa: Employee | null = null;
let receptionQa: Employee | null = null;
let barberOne: Employee | null = null;
let barberTwo: Employee | null = null;

async function login(page: Page, email: string, password: string) {
  await installVisualCursor(page);
  await page.goto("/login");
  const emailField = page.getByLabel("Email");
  const submit = page.getByRole("button", { name: "Ingresar" });
  await highlightLocator(emailField);
  await emailField.fill(email);
  await page.getByLabel("Password").fill(password);
  await highlightLocator(submit);
  await submit.click();
  await page.waitForURL(/\/(control|cambiar-contrasena-obligatoria)$/, { timeout: 15_000 });
  await visualPause(page);
}

async function getBranches(page: Page) {
  const response = await page.request.get("/api/admin/branches");
  expect(response.ok()).toBe(true);
  const payload = await response.json();
  return (payload.data ?? []) as Branch[];
}

async function getEmployees(page: Page) {
  const response = await page.request.get("/api/admin/employees");
  expect(response.ok()).toBe(true);
  const payload = await response.json();
  return (payload.data ?? []) as Employee[];
}

async function createBranchViaUi(page: Page, code: string, name: string, slug: string) {
  await page.goto("/control/sedes");
  const create = page.getByRole("button", { name: "Nueva sede" });
  await highlightLocator(create);
  await create.click();
  await visualPause(page);
  const dialog = page.getByRole("dialog", { name: "Nueva sede" });
  const fields = dialog.locator("input");

  await fields.nth(0).fill(code);
  await fields.nth(1).fill(slug);
  await fields.nth(2).fill(name);
  await dialog.locator("textarea").fill("QA_TEST_DATA Sprint 9");
  const submit = dialog.getByRole("button", { name: "Crear sede" });
  await highlightLocator(submit);
  await submit.click();
  await page.locator(".swal2-popup").waitFor({ state: "visible" });
  await page.locator(".swal2-confirm").click();
  await visualPause(page);
}

async function createEmployeeViaUi(
  page: Page,
  options: { fullName: string; email: string; role: string; branchId?: string; canLogin: boolean },
) {
  await page.goto("/control/equipo");
  const create = page.getByRole("button", { name: "Nuevo empleado" });
  await highlightLocator(create);
  await create.click();
  await visualPause(page);
  const dialog = page.getByRole("dialog", { name: "Nuevo empleado" });
  const fields = dialog.locator("input");

  await fields.nth(0).fill(options.fullName);
  await fields.nth(2).fill(options.email);
  await dialog.locator("select").nth(1).selectOption(options.branchId ?? "");
  await dialog.locator("select").nth(2).selectOption(options.role);

  const accessInput = dialog.locator('input[type="checkbox"]');
  if (options.canLogin) {
    await expect(accessInput).toBeEnabled();
    await accessInput.check();
    await dialog.locator('input[type="password"]').fill(temporaryPassword);
  } else {
    await expect(accessInput).toBeDisabled();
  }

  await dialog.locator("textarea").fill("QA_TEST_DATA Sprint 9");
  const submit = dialog.getByRole("button", { name: "Crear empleado" });
  await highlightLocator(submit);
  await submit.click();
  await page.locator(".swal2-popup").waitFor({ state: "visible" });
  await page.locator(".swal2-confirm").click();
  await visualPause(page);
}

async function completeForcedPasswordChange(page: Page) {
  if (!page.url().includes("/cambiar-contrasena-obligatoria")) {
    return;
  }

  await page.locator('input[name="current-password"]').fill(temporaryPassword);
  await page.locator('input[name="new-password"]').fill(nextPassword);
  await page.locator('input[name="confirm-password"]').fill(nextPassword);
  const submit = page.getByRole("button", { name: /Actualizar contrase/ });
  await highlightLocator(submit);
  await submit.click();
  await page.locator(".swal2-confirm").click();
  await page.waitForURL(/\/control$/, { timeout: 15_000 });
  await visualPause(page);
}

async function verifyProfile(page: Page, expectedRole: string, expectedBranchId?: string) {
  const response = await page.request.get("/api/auth/me");
  expect(response.ok()).toBe(true);
  const payload = await response.json();

  expect(payload.data.role).toBe(expectedRole);
  expect(payload.data.mustChangePassword).toBe(false);
  if (expectedBranchId) {
    expect(payload.data.branchId).toBe(expectedBranchId);
  }
}

async function toggleEmployeeFromOwner(page: Page, employee: Employee) {
  await page.goto("/control/equipo");
  const row = page.locator("tr").filter({ hasText: employee.full_name });
  const update = page.waitForResponse((response) => {
    return (
      response.url().includes(`/api/admin/employees/${employee.id}`) &&
      response.request().method() === "PUT"
    );
  });
  await row.getByRole("button").nth(2).click();
  await page.locator(".swal2-popup").waitFor({ state: "visible" });
  await page.locator(".swal2-confirm").click();
  expect((await update).ok()).toBe(true);
}

test.describe.serial("iteracion 5: altas reales y control de acceso", () => {
  test("owner crea o reutiliza las sedes QA por la interfaz", async ({ page }) => {
    test.setTimeout(scenarioTimeout);
    await login(page, ownerCredentials.email, ownerCredentials.password);
    await showQaScenarioBanner(page, {
      scenario: "Preparacion de sedes QA",
      role: "Owner",
      branch: "Global",
      step: "1 de 3",
    });
    await expect(page).toHaveURL(/\/control$/);
    await verifyProfile(page, "owner");

    let branches = await getBranches(page);
    sedOne = branches.find((branch) => branch.code === "SED-001") ?? null;
    sedTwo = branches.find((branch) => branch.code === "SED-002") ?? null;

    if (!sedOne) {
      await createBranchViaUi(page, "SED-001", "QA_TEST_DATA Sede Uno", `qa-test-data-sede-uno-${runId}`);
    }
    if (!sedTwo) {
      await createBranchViaUi(page, "SED-002", "QA_TEST_DATA Sede Dos", `qa-test-data-sede-dos-${runId}`);
    }

    branches = await getBranches(page);
    sedOne = branches.find((branch) => branch.code === "SED-001") ?? null;
    sedTwo = branches.find((branch) => branch.code === "SED-002") ?? null;

    expect(sedOne?.is_active).toBe(true);
    expect(sedTwo?.is_active).toBe(true);
    await visualPause(page);
  });

  test("owner crea admin, recepcion y barberos con la politica de acceso", async ({ page }) => {
    test.setTimeout(scenarioTimeout);
    expect(sedOne).not.toBeNull();
    expect(sedTwo).not.toBeNull();
    await login(page, ownerCredentials.email, ownerCredentials.password);
    await showQaScenarioBanner(page, {
      scenario: "Altas QA y barberos sin login",
      role: "Owner",
      branch: "Global",
      step: "2 de 3",
    });

    await createEmployeeViaUi(page, {
      fullName: `QA_TEST_DATA Admin ${runId}`,
      email: qa.adminEmail,
      role: "admin",
      canLogin: true,
    });
    await createEmployeeViaUi(page, {
      fullName: `QA_TEST_DATA Recepcion ${runId}`,
      email: qa.receptionEmail,
      role: "reception",
      branchId: sedOne!.id,
      canLogin: true,
    });
    await createEmployeeViaUi(page, {
      fullName: `QA_TEST_DATA Barbero Uno ${runId}`,
      email: `qa-barber-one-${runId}@example.invalid`,
      role: "barber",
      branchId: sedOne!.id,
      canLogin: false,
    });
    await createEmployeeViaUi(page, {
      fullName: `QA_TEST_DATA Barbero Dos ${runId}`,
      email: `qa-barber-two-${runId}@example.invalid`,
      role: "barber",
      branchId: sedTwo!.id,
      canLogin: false,
    });

    const employees = await getEmployees(page);
    adminQa = employees.find((employee) => employee.email === qa.adminEmail) ?? null;
    receptionQa = employees.find((employee) => employee.email === qa.receptionEmail) ?? null;
    barberOne = employees.find((employee) => employee.full_name === `QA_TEST_DATA Barbero Uno ${runId}`) ?? null;
    barberTwo = employees.find((employee) => employee.full_name === `QA_TEST_DATA Barbero Dos ${runId}`) ?? null;

    expect(adminQa?.user_id).not.toBeNull();
    expect(adminQa?.can_login).toBe(true);
    expect(receptionQa?.user_id).not.toBeNull();
    expect(receptionQa?.can_login).toBe(true);
    expect(barberOne).toMatchObject({ user_id: null, can_login: false, branch_id: sedOne!.id });
    expect(barberTwo).toMatchObject({ user_id: null, can_login: false, branch_id: sedTwo!.id });
  });

  test("admin y recepcion completan acceso temporal, respetan rol y se bloquean al desactivarse", async ({ page, browser }) => {
    test.setTimeout(scenarioTimeout);
    expect(adminQa).not.toBeNull();
    expect(receptionQa).not.toBeNull();
    expect(sedOne).not.toBeNull();
    await showQaScenarioBanner(page, {
      scenario: "Roles y bloqueo por desactivacion",
      role: "Admin y Reception",
      branch: "SED-001",
      step: "3 de 3",
    });

    mkdirSync("test-results/qa-sprint-9/.auth", { recursive: true });
    const adminContext = await browser.newContext({ baseURL: "http://127.0.0.1:3100" });
    const adminPage = await adminContext.newPage();
    await login(adminPage, qa.adminEmail, temporaryPassword);
    await completeForcedPasswordChange(adminPage);
    await verifyProfile(adminPage, "admin");
    await adminContext.storageState({ path: "test-results/qa-sprint-9/.auth/admin.json" });

    const receptionContext = await browser.newContext({ baseURL: "http://127.0.0.1:3100" });
    const receptionPage = await receptionContext.newPage();
    await login(receptionPage, qa.receptionEmail, temporaryPassword);
    await completeForcedPasswordChange(receptionPage);
    await verifyProfile(receptionPage, "reception", sedOne!.id);
    await receptionContext.storageState({ path: "test-results/qa-sprint-9/.auth/reception.json" });
    await receptionPage.goto("/control/finanzas");
    await expect(receptionPage.getByText("Acceso restringido")).toBeVisible();

    await login(page, ownerCredentials.email, ownerCredentials.password);
    await toggleEmployeeFromOwner(page, adminQa!);
    const blockedAdminWrite = await adminPage.request.post("/api/admin/branches", { data: {} });
    expect(blockedAdminWrite.status()).toBe(403);
    await toggleEmployeeFromOwner(page, adminQa!);

    await toggleEmployeeFromOwner(page, receptionQa!);
    const blockedReceptionWrite = await receptionPage.request.post("/api/admin/pos/sessions/open", { data: {} });
    expect(blockedReceptionWrite.status()).toBe(403);
    await toggleEmployeeFromOwner(page, receptionQa!);

    await adminContext.close();
    await receptionContext.close();
  });

  test("owner limpia los accesos y registros QA marcados", async ({ page }) => {
    await login(page, ownerCredentials.email, ownerCredentials.password);
    const response = await page.request.post("/api/admin/qa/cleanup-employees");
    expect(response.ok()).toBe(true);

    rmSync("test-results/qa-sprint-9/.auth", { recursive: true, force: true });
    await removeQaScenarioBanner(page);
  });
});
