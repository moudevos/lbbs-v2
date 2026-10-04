import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const secret = process.env.HOTSPOT_CAPTIVE_TOKEN_SECRET;
export function normalizeDni(value: unknown) { const dni = typeof value === "string" ? value.replace(/\D/g, "") : ""; return /^\d{8}$/.test(dni) ? dni : null; }
export function normalizeCode(value: unknown) { const code = typeof value === "string" ? value.trim() : ""; return /^\d{6}$/.test(code) ? code : null; }
export function hashCode(code: string) { return createHash("sha256").update(code.trim()).digest("hex"); }
export function signHotspotToken(payload: Record<string, unknown>) { if (!secret) throw new Error("Captive access is not configured."); const body = Buffer.from(JSON.stringify(payload)).toString("base64url"); const signature = createHmac("sha256", secret).update(body).digest("base64url"); return `${body}.${signature}`; }
export function readHotspotToken(token: unknown) { if (!secret || typeof token !== "string") return null; const [body, signature] = token.split("."); if (!body || !signature) return null; const expected = createHmac("sha256", secret).update(body).digest("base64url"); if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null; try { const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as Record<string, unknown>; return typeof payload.exp === "number" && payload.exp > Date.now() ? payload : null; } catch { return null; } }
export const publicError = "El código no es válido o ya no está disponible.";
