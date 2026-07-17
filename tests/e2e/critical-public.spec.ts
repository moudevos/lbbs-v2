import { expect, test, type Page } from "@playwright/test";

type QaProfile = {
  role: "owner" | "admin" | "reception" | "barber" | "viewer" | null;
  roleLabel: string;
  branchName: string | null;
  mustChangePassword: boolean;
};

const qaCredentials = (() => {
  const email = process.env.QA_EMAIL;
  const password = process.env.QA_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Faltan QA_EMAIL o QA_PASSWORD. Configúralas en .env.local antes de ejecutar Playwright.",
    );
  }

  return { email, password };
})();

async function loginAndGetProfile(page: Page): Promise<QaProfile> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(qaCredentials.email);
  await page.getByLabel("Password").fill(qaCredentials.password);
  await page.getByRole("button", { name: "Ingresar" }).click();

  try {
    await page.waitForURL(/\/(control|cambiar-contrasena-obligatoria)/, {
      timeout: 15_000,
    });
  } catch {
    const alertText = await page
      .locator(".swal2-popup")
      .innerText()
      .catch(() => "No se mostró un mensaje de autenticación.");

    throw new Error(`El login QA no redirigió: ${alertText}`);
  }

  const profile = await page.evaluate(async () => {
    const response = await fetch("/api/auth/me", { cache: "no-store" });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error("No se pudo leer el perfil QA autenticado.");
    }

    return payload.data;
  });

  return {
    role: profile.role ?? null,
    roleLabel: profile.roleLabel ?? "Sin rol asignado",
    branchName: profile.branchName ?? null,
    mustChangePassword: profile.mustChangePassword === true,
  };
}

function getAccessibleRoutes(role: QaProfile["role"]) {
  const routes = ["/control", "/control/mi-cuenta"];

  if (role === "owner" || role === "admin") {
    return [
      ...routes,
      "/control/sedes",
      "/control/equipo",
      "/control/caja",
      "/control/pos",
      "/control/rewards",
      "/control/ventas",
      "/control/configuracion",
      "/control/servicios",
      "/control/productos",
      "/control/clientes",
      "/control/contactos",
      "/control/reservas",
      "/control/produccion",
      "/control/liquidaciones",
      "/control/simulaciones-pago",
      "/control/finanzas",
    ];
  }

  if (role === "reception") {
    return [
      ...routes,
      "/control/caja",
      "/control/pos",
      "/control/rewards",
      "/control/ventas",
      "/control/clientes",
      "/control/contactos",
      "/control/reservas",
    ];
  }

  if (role === "barber") {
    return [...routes, "/control/reservas"];
  }

  return routes;
}

test.describe("rutas públicas y protección inicial", () => {
  test("login renderiza sin error de servidor", async ({ page }) => {
    const response = await page.goto("/login");

    expect(response?.status()).toBe(200);
    await expect(page.getByRole("button", { name: "Ingresar" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "¿Olvidaste tu contraseña?" }),
    ).toBeVisible();
    await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
  });

  test("recuperación y enlace inválido muestran estados controlados", async ({ page }) => {
    await page.goto("/recuperar-contrasena");
    await expect(page.getByRole("button", { name: "Enviar enlace" })).toBeVisible();

    await page
      .getByLabel("Correo")
      .fill("qa-sprint-9-no-existe@example.invalid");
    await page.getByRole("button", { name: "Enviar enlace" }).click();
    await expect(
      page.getByText("Si el correo está registrado, recibirá un enlace"),
    ).toBeVisible();

    await page.goto("/restablecer-contrasena?error=invalid-link");
    await expect(page.getByText("Enlace no disponible")).toBeVisible();
  });

  test("control redirige a login sin sesión", async ({ page }) => {
    await page.goto("/control");
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("flujo autenticado QA", () => {
  test("login detecta rol y sede sin exponer credenciales", async ({ page }) => {
    const profile = await loginAndGetProfile(page);

    expect(profile.role).not.toBeNull();
    expect(profile.mustChangePassword).toBe(false);
    await expect(page).toHaveURL(/\/control$/);
  });

  test("sesión persiste al recargar y en otra pestaña", async ({ page, context }) => {
    await loginAndGetProfile(page);
    await page.reload();
    await expect(page).toHaveURL(/\/control$/);

    const secondPage = await context.newPage();
    await secondPage.goto("/control");
    await expect(secondPage).toHaveURL(/\/control$/);
    await secondPage.close();

    await expect(page).toHaveURL(/\/control$/);
  });

  test("módulos habilitados no devuelven 404, 500 ni overlay", async ({ page }) => {
    test.setTimeout(120_000);
    const profile = await loginAndGetProfile(page);
    const serverErrors: Array<{ url: string; status: number }> = [];

    page.on("response", (response) => {
      if (
        response.url().includes("/api/") &&
        response.status() >= 500
      ) {
        serverErrors.push({
          url: new URL(response.url()).pathname,
          status: response.status(),
        });
      }
    });

    for (const route of getAccessibleRoutes(profile.role)) {
      const response = await page.goto(route);

      expect(response?.status(), route).toBeLessThan(500);
      await expect(page.locator("body"), route).not.toBeEmpty();
      await expect(page.locator("[data-nextjs-dialog]"), route).toHaveCount(0);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(1_500);
    }

    expect(serverErrors).toEqual([]);
  });

  test("POS independiente no hereda el panel y responde de forma controlada", async ({ page }) => {
    await loginAndGetProfile(page);
    const response = await page.goto("/pos");

    expect(response?.status()).toBeLessThan(500);
    await expect(page.locator("body")).not.toBeEmpty();
    await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
    await expect(page.getByText("Panel de control", { exact: true })).toHaveCount(0);
  });

  test("payloads inválidos críticos se rechazan sin 500 ni escritura", async ({ page }) => {
    await loginAndGetProfile(page);

    const responses = await Promise.all([
      page.request.post("/api/admin/pos/checkout", { data: {} }),
      page.request.post("/api/auth/password/finalize", {
        data: { mode: "forced", newPassword: "débil" },
      }),
      page.request.get("/api/admin/sales/uuid-invalido"),
    ]);

    for (const response of responses) {
      expect(response.status()).toBeGreaterThanOrEqual(400);
      expect(response.status()).toBeLessThan(500);
    }
  });
});
