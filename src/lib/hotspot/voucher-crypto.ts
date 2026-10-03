import "server-only";

import { createDecipheriv } from "node:crypto";

function encryptionKey() {
  const encoded = process.env.HOTSPOT_VOUCHER_ENCRYPTION_KEY;
  if (!encoded) throw new Error("Hotspot voucher encryption is not configured.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("Hotspot voucher encryption key is invalid.");
  return key;
}

/** Decrypts only in memory immediately before a router command is returned. */
export function decryptVoucherCode(ciphertext: string) {
  const [version, ivText, tagText, payloadText] = ciphertext.split(".");
  if (version !== "v1" || !ivText || !tagText || !payloadText) {
    throw new Error("Hotspot voucher ciphertext is invalid.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivText, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(payloadText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
