import { describe, expect, it } from "vitest";

import { validatePasswordPolicy } from "@/lib/auth/password-policy";
import { getSafeAuthRedirect } from "@/lib/auth/public-url";
import { canAccessModule, getVisibleModules } from "@/lib/auth/module-permissions";

describe("política de contraseña", () => {
  it("acepta una contraseña que cumple todos los requisitos", () => {
    expect(validatePasswordPolicy("Segura#2026").valid).toBe(true);
  });

  it("rechaza contraseñas débiles", () => {
    const result = validatePasswordPolicy("corta");

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Al menos 8 caracteres");
    expect(result.errors).toContain("Una letra mayúscula");
  });
});

describe("redirecciones de autenticación", () => {
  it("acepta únicamente rutas internas autorizadas", () => {
    expect(getSafeAuthRedirect("/control")).toBe("/control");
    expect(getSafeAuthRedirect("/restablecer-contrasena")).toBe(
      "/restablecer-contrasena",
    );
  });

  it("bloquea open redirects y rutas no autorizadas", () => {
    expect(getSafeAuthRedirect("https://malicioso.example")).toBe(
      "/restablecer-contrasena",
    );
    expect(getSafeAuthRedirect("//malicioso.example")).toBe(
      "/restablecer-contrasena",
    );
    expect(getSafeAuthRedirect("/control/pos")).toBe(
      "/restablecer-contrasena",
    );
  });
});

describe("permisos de módulos", () => {
  it("mantiene POS fuera del alcance de barber y viewer", () => {
    expect(canAccessModule("barber", "pos")).toBe(false);
    expect(canAccessModule("viewer", "pos")).toBe(false);
    expect(canAccessModule("reception", "pos")).toBe(true);
  });

  it("no expone módulos administrativos a recepción", () => {
    expect(getVisibleModules("reception")).not.toContain("employees");
    expect(getVisibleModules("reception")).not.toContain("finance");
  });
});
