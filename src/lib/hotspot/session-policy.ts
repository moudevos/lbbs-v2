/** WiFi Clientes: RouterOS keeps briefly disconnected devices in active until the 3m keepalive expires. */
export type SessionExpiryReason = "absolute_deadline" | "session_missing";

export function customerExpiryReason(
  voucher: { id: string; session_expires_at: string | null },
  observedActive: ReadonlySet<string>,
  now: number,
): SessionExpiryReason | null {
  if (!voucher.session_expires_at || !Number.isFinite(Date.parse(voucher.session_expires_at))) {
    return "absolute_deadline"; // unknown deadline is not safe to keep online
  }
  if (Date.parse(voucher.session_expires_at) <= now) return "absolute_deadline";
  if (!observedActive.has(voucher.id.toLowerCase())) return "session_missing";
  return null;
}
