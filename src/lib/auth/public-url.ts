export function getPublicAppUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return process.env.NODE_ENV === "production" ? null : "http://localhost:3000";
}

export function getSafeAuthRedirect(next: string | null | undefined) {
  const allowed = new Set([
    "/restablecer-contrasena",
    "/cambiar-contrasena-obligatoria",
    "/control",
    "/login",
  ]);
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes(":") || !allowed.has(next)) {
    return "/restablecer-contrasena";
  }
  return next;
}
