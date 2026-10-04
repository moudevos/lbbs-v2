import { describe, expect, it, vi } from "vitest";

import { invokeWalletSyncWorker } from "@/lib/wallet/wallet-sync-kick-core";

describe("Wallet event-driven kick", () => {
  it("invoca al worker interno una vez y no expone el secreto en logs", async () => {
    const log = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const result = await invokeWalletSyncWorker({
      source: "sale_completed",
      customerAppUrl: "http://localhost:3001",
      secret: "secret-only-on-server",
      fetchImpl,
      log,
    });

    expect(result).toBe("completed");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe("http://localhost:3001/api/internal/wallet/sync");
    expect(log.mock.calls.flat().join(" ")).not.toContain("secret-only-on-server");
  });

  it("absorbe fallos o timeout del worker sin propagar una excepción comercial", async () => {
    const log = vi.fn();
    const result = await invokeWalletSyncWorker({
      source: "sale_completed",
      customerAppUrl: "http://localhost:3001",
      secret: "server-secret",
      fetchImpl: vi.fn().mockRejectedValue(new Error("network unavailable")),
      log,
    });

    expect(result).toBe("failed");
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ result: "failed" }));
  });

  it("no intenta la llamada si falta configuración server-only", async () => {
    const fetchImpl = vi.fn();
    const result = await invokeWalletSyncWorker({
      source: "sale_completed",
      customerAppUrl: null,
      secret: null,
      fetchImpl,
      log: vi.fn(),
    });

    expect(result).toBe("skipped_not_configured");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
