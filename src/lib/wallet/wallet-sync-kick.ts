import "server-only";

import { after } from "next/server";

import {
  invokeWalletSyncWorker,
  type WalletSyncKickResult,
  type WalletSyncKickSource,
} from "@/lib/wallet/wallet-sync-kick-core";

export type { WalletSyncKickResult, WalletSyncKickSource } from "@/lib/wallet/wallet-sync-kick-core";

function setting(name: string) {
  return process.env[name]?.trim() ?? "";
}

export function getCustomerAppInternalUrl() {
  const configured = setting("CUSTOMER_APP_INTERNAL_URL");
  if (!configured) return null;

  try {
    return new URL(configured).origin;
  } catch {
    return null;
  }
}

export async function triggerWalletSyncWorker(
  source: WalletSyncKickSource,
  {
    fetchImpl = fetch,
    timeoutMs = 85_000,
  }: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  } = {},
): Promise<WalletSyncKickResult> {
  const customerAppUrl = getCustomerAppInternalUrl();
  const secret = setting("WALLET_SYNC_INTERNAL_SECRET");
  return invokeWalletSyncWorker({
    source,
    customerAppUrl,
    secret,
    fetchImpl,
    timeoutMs,
    log: (event) => {
      const logger = event.result === "failed" || event.result === "skipped_not_configured" ? console.warn : console.info;
      logger("[wallet-kick]", event);
    },
  });
}

/** Schedules a best-effort server-to-server wake-up only after the business response is sent. */
export function scheduleWalletSyncKick(source: WalletSyncKickSource) {
  console.info("[wallet-kick]", { source, scheduled: true });
  after(async () => {
    await triggerWalletSyncWorker(source);
  });
}
