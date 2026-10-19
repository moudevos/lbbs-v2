const CANONICAL_PRODUCTION_APP_URL =
  "https://app.labajaditabarberstudio.com";

function normalizePublicUrl(value: string | undefined | null) {
  const candidate = value?.trim();
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function isLocalhostUrl(value: string) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname.endsWith(".localhost")
    );
  } catch {
    return true;
  }
}

export function resolvePublicAppUrl({
  configured,
  nodeEnv,
}: {
  configured?: string | null;
  nodeEnv?: string | null;
}) {
  const normalizedConfigured = normalizePublicUrl(configured);

  if (nodeEnv === "production") {
    // La recuperación de contraseña es un flujo externo que se abre desde el
    // correo. En producción nunca debe depender de una variable heredada de
    // desarrollo ni apuntar a localhost.
    if (
      normalizedConfigured &&
      !isLocalhostUrl(normalizedConfigured) &&
      normalizedConfigured === CANONICAL_PRODUCTION_APP_URL
    ) {
      return normalizedConfigured;
    }

    return CANONICAL_PRODUCTION_APP_URL;
  }

  return normalizedConfigured ?? "http://localhost:3000";
}

export function getPublicAppUrl() {
  return resolvePublicAppUrl({
    configured: process.env.NEXT_PUBLIC_APP_URL,
    nodeEnv: process.env.NODE_ENV,
  });
}

export function getSafeAuthRedirect(next: string | null | undefined) {
  const allowed = new Set([
    "/restablecer-contrasena",
    "/cambiar-contrasena-obligatoria",
    "/control",
    "/login",
  ]);
  if (
    !next ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.includes(":") ||
    !allowed.has(next)
  ) {
    return "/restablecer-contrasena";
  }
  return next;
}
