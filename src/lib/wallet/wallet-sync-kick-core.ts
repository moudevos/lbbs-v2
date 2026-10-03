export type WalletSyncKickSource =
  | "sale_completed"
  | "reward_redemption"
  | "reward_reversal"
  | "qr_rotation"
  | "physical_migration"
  | "manual_adjustment";

export type WalletSyncKickResult = "completed" | "failed" | "skipped_not_configured";

export async function invokeWalletSyncWorker({
  source,
  customerAppUrl,
  secret,
  fetchImpl = fetch,
  timeoutMs = 85_000,
  log,
}: {
  source: WalletSyncKickSource;
  customerAppUrl: string | null;
  secret: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  log: (event: Record<string, unknown>) => void;
}): Promise<WalletSyncKickResult> {
  const startedAt = Date.now();
  if (!customerAppUrl || !secret) {
    log({ source, result: "skipped_not_configured", durationMs: Date.now() - startedAt });
    return "skipped_not_configured";
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(new URL("/api/internal/wallet/sync", customerAppUrl), {
      method: "POST",
      headers: { "x-wallet-sync-secret": secret },
      signal: controller.signal,
      cache: "no-store",
    });
    const result: WalletSyncKickResult = response.ok ? "completed" : "failed";
    log({ source, result, httpStatus: response.status, durationMs: Date.now() - startedAt });
    return result;
  } catch {
    log({ source, result: "failed", durationMs: Date.now() - startedAt });
    return "failed";
  } finally {
    clearTimeout(timeout);
  }
}
