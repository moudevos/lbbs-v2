import { captiveJson, captiveOptions } from "@/lib/hotspot/cors";

// Staff captive authentication is deliberately disabled until router-origin
// attestation, rate limiting, and lockout protections are deployed.
// Public DNI + six-digit PIN must never auto-enroll a device without them.
export function OPTIONS() { return captiveOptions(); }
export async function POST() {
  return captiveJson({ error: "El portal Staff aún no está habilitado." }, { status: 503 });
}
