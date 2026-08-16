import { expect, test } from "@playwright/test";

const credentials = { email: process.env.QA_EMAIL ?? "", password: process.env.QA_PASSWORD ?? "" };

test("owner/admin puede consultar el mapa central de deudas", async ({ page }) => {
  test.skip(!credentials.email || !credentials.password, "Faltan credenciales QA.");

  await page.goto("/login");
  await page.getByLabel("Email").fill(credentials.email);
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(/\/control/);

  const response = await page.request.get("/api/admin/employee-debts?status=open");
  expect(response.status()).toBe(200);
  const payload = await response.json();
  expect(payload).toEqual(expect.objectContaining({ debts: expect.any(Array), movements: expect.any(Array), filters: expect.any(Object) }));
  expect(payload.filters).toEqual(expect.objectContaining({ employees: expect.any(Array), branches: expect.any(Array), paymentMethods: expect.any(Array) }));

  await page.goto("/control/deudas-empleados");
  const content = page.getByRole("main");
  await expect(content.getByRole("heading", { name: "Deudas de empleados" })).toBeVisible();
  await expect(content.getByRole("heading", { name: "Mapa de deudas" })).toBeVisible();
  await expect(content.getByRole("button", { name: "Registrar deuda" })).toBeVisible();
});
