import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("Fase 2: tarjeta digital y Wallet", () => {
  it("crea token revocable, pase único y outbox deduplicado", async () => {
    const sql = await readFile(path.resolve(root, "src/sql/151_customer_digital_wallet.sql"), "utf8");
    expect(sql).toContain("customer_public_tokens");
    expect(sql).toContain("customer_public_tokens_one_active_idx");
    expect(sql).toContain("wallet_passes");
    expect(sql).toContain("unique(customer_id, provider)");
    expect(sql).toContain("customer_wallet_sync_outbox_pending_customer_idx");
  });

  it("deriva QR por auth.uid y reserva el resolver para administración", async () => {
    const sql = await readFile(path.resolve(root, "src/sql/151_customer_digital_wallet.sql"), "utf8");
    expect(sql).toContain("ensure_customer_public_token()");
    expect(sql).toContain("auth_user_id = auth.uid() and status = 'active'");
    expect(sql).toContain("if not public.is_admin() then raise exception 'No tienes permisos para resolver tarjetas digitales.'");
    expect(sql).not.toContain("p_auth_user_id");
  });

  it("encola cambios Rewards y rotación sin hacer llamadas externas desde PostgreSQL", async () => {
    const sql = await readFile(path.resolve(root, "src/sql/151_customer_digital_wallet.sql"), "utf8");
    expect(sql).toContain("customer_reward_ledger_wallet_sync");
    expect(sql).toContain("customer_reward_entitlements_wallet_sync");
    expect(sql).toContain("customer_reward_redemptions_wallet_sync");
    expect(sql).toContain("customer_public_tokens_wallet_sync");
    expect(sql).not.toContain("walletobjects.googleapis.com");
  });
});
