import { expect, test } from "@playwright/test";

const credentials = {
  email: process.env.QA_EMAIL ?? "",
  password: process.env.QA_PASSWORD ?? "",
};

test("produccion solo devuelve fechas contables dentro del periodo seleccionado", async ({ page }) => {
  test.skip(!credentials.email || !credentials.password, "Faltan credenciales QA.");

  await page.goto("/login");
  await page.getByLabel("Email").fill(credentials.email);
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(/\/control/);

  const response = await page.request.get("/api/admin/production");
  expect(response.status()).toBe(200);
  const payload = await response.json();
  const selected = payload.filters.periods.find(
    (period: { id: string }) => period.id === payload.selectedPeriodId,
  );

  expect(selected).toBeTruthy();
  expect(payload.businessDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  for (const row of payload.data as Array<{ accounting_date: string; payroll_period_id: string }>) {
    expect(row.payroll_period_id).toBe(selected.id);
    expect(row.accounting_date >= selected.start_date).toBe(true);
    expect(row.accounting_date <= selected.end_date).toBe(true);
  }
  for (const row of payload.bonuses as Array<{ accounting_date: string; payroll_period_id: string }>) {
    expect(row.payroll_period_id).toBe(selected.id);
    expect(row.accounting_date >= selected.start_date).toBe(true);
    expect(row.accounting_date <= selected.end_date).toBe(true);
  }

  await page.goto("/control/produccion");
  await expect(page.getByText("Control de produccion")).toBeVisible();
});
