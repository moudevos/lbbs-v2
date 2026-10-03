import { expect, test } from "@playwright/test";

test("harness de aceptación detecta el servidor local", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBe(true);
});
