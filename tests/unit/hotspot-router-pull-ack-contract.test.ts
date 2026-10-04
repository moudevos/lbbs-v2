import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = (...parts: string[]) => path.resolve(process.cwd(), ...parts);

describe("router hotspot pull y ACK", () => {
  it("autentica el router sólo mediante Bearer token y distingue disabled", async () => {
    const auth = await readFile(root("src/lib/hotspot/router-auth.ts"), "utf8");
    expect(auth).toContain('request.headers.get("authorization")');
    expect(auth).toContain('.eq("token_hash", hashRouterToken(token))');
    expect(auth).toContain('router.status === "disabled"');
  });

  it("reclama con bloqueo real, transiciona a processing y recupera timeouts", async () => {
    const migration = await readFile(root("src/sql/170_release_pre_treasury.sql"), "utf8");
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("status = 'processing'");
    expect(migration).toContain("attempts = c.attempts + 1");
    expect(migration).toContain("make_interval(secs => greatest(p_processing_timeout_seconds, 1))");
  });

  it("entrega CREATE con plaintext efímero y no lo registra", async () => {
    const pull = await readFile(root("src/app/api/wifi/router/pull/route.ts"), "utf8");
    expect(pull).toContain("decryptVoucherCode(ciphertext)");
    expect(pull).toContain('type: "CREATE_VOUCHER"');
    expect(pull).toContain("username: code");
    expect(pull).toContain("password: code");
    expect(pull).not.toContain("console.log(code)");
  });

  it("hace ACK idempotente, aislado por router y limpia ciphertext al aplicar", async () => {
    const migration = await readFile(root("src/sql/170_release_pre_treasury.sql"), "utf8");
    expect(migration).toContain("where id = p_command_id and router_id = p_router_id");
    expect(migration).toContain("if v_command.status = 'applied'");
    expect(migration).toContain("code_ciphertext = null");
    expect(migration).toContain("status = 'sync_error'");
  });

  it("incluye heartbeat y la UI deriva online/offline con polling", async () => {
    const heartbeat = await readFile(root("src/app/api/wifi/router/heartbeat/route.ts"), "utf8");
    const page = await readFile(root("src/features/wifi/WifiPageClient.tsx"), "utf8");
    expect(heartbeat).toContain("last_seen_at");
    expect(heartbeat).toContain("routeros_version");
    expect(page).toContain("ONLINE_WINDOW_MS = 90_000");
    expect(page).toContain("12_000");
    expect(page).toContain('pending_sync: "Sincronizando"');
  });
});
