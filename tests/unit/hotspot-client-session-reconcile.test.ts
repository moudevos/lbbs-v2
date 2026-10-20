import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { customerExpiryReason } from "@/lib/hotspot/session-policy";

const voucherId = "c421b1e3-86fa-421d-bdd0-13b25e0f3c88";
const now = Date.UTC(2026, 9, 19, 20, 0, 0);
const later = new Date(now + 10 * 60_000).toISOString();
const earlier = new Date(now - 1).toISOString();

describe("LBBS Clientes: expiración segura mediante inventario RouterOS", () => {
  it("preserva la sesión que sigue activa, incluyendo reconexión dentro del keepalive de 3m", () => {
    expect(customerExpiryReason(
      { id: voucherId, session_expires_at: later },
      new Set([voucherId]), now,
    )).toBeNull();
  });

  it("termina el voucher cuando RouterOS ya no conserva la sesión después del keepalive", () => {
    expect(customerExpiryReason(
      { id: voucherId, session_expires_at: later },
      new Set(), now,
    )).toBe("session_missing");
  });

  it("impone fecha límite absoluta, incluso si RouterOS conserva la sesión activa", () => {
    expect(customerExpiryReason(
      { id: voucherId, session_expires_at: earlier },
      new Set([voucherId]), now,
    )).toBe("absolute_deadline");
    expect(customerExpiryReason(
      { id: voucherId, session_expires_at: new Date(now).toISOString() },
      new Set([voucherId]), now,
    )).toBe("absolute_deadline");
  });

  it("deniega de forma conservadora registros sin vencimiento válido", () => {
    expect(customerExpiryReason({ id: voucherId, session_expires_at: null }, new Set([voucherId]), now)).toBe("absolute_deadline");
    expect(customerExpiryReason({ id: voucherId, session_expires_at: "invalid" }, new Set([voucherId]), now)).toBe("absolute_deadline");
  });

  it("reconcilia con autenticación, inventario válido y expiración gestionada por ACK", () => {
    const route = readFileSync(path.resolve("src/app/api/wifi/router/reconcile/route.ts"), "utf8");
    const installer = readFileSync(path.resolve("routeros/rebuild/33-lbbs-clientes-session-reconcile.rsc"), "utf8");
    expect(route).toContain("authenticateRouter(request)");
    expect(route).not.toContain('p_event: "LOGOUT"');
    expect(route).toContain('if (reason === "session_missing")');
    expect(route).toContain("deferredMissing++");
    expect(route).toContain('"EXPIRE_VOUCHER"');
    expect(route).toContain('idempotency_key: "expire:"');
    expect(route).not.toContain('"router_active_snapshot"');
    expect(route).toContain('reason: "absolute_deadline"');
    expect(installer).toContain("activeVoucherIds");
    expect(installer).toContain("/api/wifi/router/reconcile");
    expect(installer).toContain('interval=30s');
    expect(installer).toContain("check-certificate=yes");
    expect(installer).not.toContain("/ip firewall filter enable");
    expect(installer).not.toContain("/ip hotspot user remove");
    expect(installer).not.toContain("lbbs_rt_");
  });
});
