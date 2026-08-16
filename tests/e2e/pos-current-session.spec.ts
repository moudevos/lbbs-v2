import { expect, test } from "@playwright/test";

const credentials = {
  email: process.env.QA_EMAIL ?? "",
  password: process.env.QA_PASSWORD ?? "",
};

test("la sesión POS vigente queda seleccionada y permite abrir la interfaz", async ({ page }) => {
  test.skip(!credentials.email || !credentials.password, "Faltan credenciales QA.");

  await page.goto("/login");
  await page.getByLabel("Email").fill(credentials.email);
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(/\/control/);

  const bootstrap = await page.request.get("/api/admin/pos/bootstrap");
  expect(bootstrap.status()).toBe(200);
  const payload = await bootstrap.json();
  expect(payload.activeSession).toMatchObject({ status: "open" });
  expect(payload.selectedBranchId).toBe(payload.activeSession.branch_id);

  await page.goto("/control/pos");
  const openLink = page.getByRole("link", { name: "Abrir POS" });
  await expect(openLink).toBeVisible();
  await expect(openLink).toHaveAttribute("href", new RegExp(`/pos\\?session_id=${payload.activeSession.id}`));
  await expect(page.getByText("Sesion abierta", { exact: true })).toBeVisible();
});

test("configuración abre el panel de beneficios con búsqueda de cliente", async ({ page }) => {
  test.skip(!credentials.email || !credentials.password, "Faltan credenciales QA.");

  await page.goto("/login");
  await page.getByLabel("Email").fill(credentials.email);
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(/\/control/);
  await page.goto("/control/configuracion?tab=internal-benefits");

  await expect(page.getByRole("heading", { name: "Beneficios y crédito interno" })).toBeVisible();
  await expect(page.getByLabel("Buscar cliente")).toBeVisible();
  await expect(page.getByLabel("Barbero o empleado")).toBeVisible();
  await expect(page.getByLabel("Barbero o empleado").locator("option")).toHaveCount(19);
  await page.getByLabel("Buscar cliente").fill("73531356");
  await expect(page.getByLabel("Cliente registrado").locator("option")).toHaveCount(2);
});
