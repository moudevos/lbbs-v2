import { expect, test } from "@playwright/test";

const credentials = (() => {
  const email = process.env.QA_EMAIL;
  const password = process.env.QA_PASSWORD;

  if (!email || !password) {
    throw new Error("Faltan QA_EMAIL o QA_PASSWORD para validar el acceso de empleados.");
  }

  return { email, password };
})();

test("el API rechaza crear login para un barbero sin crear usuario Auth", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(credentials.email);
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(/\/control$/, { timeout: 15_000 });

  const marker = crypto.randomUUID();
  const response = await page.request.post("/api/admin/employees", {
    data: {
      full_name: `QA_TEST_DATA Barber bloqueado ${marker}`,
      email: `qa-test-data-barber-${marker}@example.invalid`,
      role: "barber",
      status: "active",
      can_login: true,
      temporary_password: `Qa#${marker.slice(0, 12)}a`,
    },
  });

  const payload = await response.json();

  expect(response.status()).toBe(400);
  expect(payload.error).toContain("Solo owner");
});

test("limpia solo empleados QA marcados mediante la ruta protegida", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(credentials.email);
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(/\/control$/, { timeout: 15_000 });

  const response = await page.request.post("/api/admin/qa/cleanup-employees");

  expect(response.status()).toBe(200);
});
