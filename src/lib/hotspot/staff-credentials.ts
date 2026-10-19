import "server-only";

import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";

const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const macPattern = /^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$/;

/**
 * Return device-specific, deterministic HotSpot credentials WITHOUT exposing
 * the original Staff PIN or its scrypt hash to RouterOS or the captive page.
 * Code rotation changes code_hash and therefore the RouterOS password.
 * The HMAC key is server-only, per deployment; never commit it or put it in
 * RouterOS. Never log or persist a derived password in Supabase.
 */
export function deriveStaffHotspotCredential(credentialId: string, codeHash: string, mac: string) {
  const key = process.env.LBBS_STAFF_HOTSPOT_SECRET;
  if (!key || key.length < 32) throw new Error("Staff HotSpot server secret missing");
  if (!idPattern.test(credentialId) || !macPattern.test(mac)) throw new Error("Invalid Staff device identity");
  const username = "lbs-" + credentialId.replace(/-/g, "") + "-" + mac.replace(/:/g, "");
  const password = createHmac("sha256", key)
    .update(["staff-hotspot-v1", credentialId.toLowerCase(), codeHash, mac].join("|"))
    .digest("base64url");
  return { username, password };
}

export function verifyStaffCode(code: string, storedHash: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const [algorithm, salt, digest] = storedHash.split(":");
  if (algorithm !== "scrypt" || !/^[a-f0-9]{32}$/.test(salt ?? "") || !/^[a-f0-9]{128}$/.test(digest ?? "")) return false;
  return timingSafeEqual(scryptSync(code, salt, 64), Buffer.from(digest, "hex"));
}
