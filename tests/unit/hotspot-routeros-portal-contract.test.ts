import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFile(path.resolve(process.cwd(), file), "utf8");

describe("base RouterOS y portal HotSpot", () => {
  it("mantiene el instalador incremental y parametrizado", async () => {
    const template = await read("routeros/hotspot/install.rsc.template");
    for (const placeholder of ["HOTSPOT_INTERFACE", "HOTSPOT_SERVER_NAME", "HOTSPOT_PROFILE_NAME", "HOTSPOT_ADDRESS", "HOTSPOT_POOL_NAME", "HOTSPOT_POOL_RANGE", "HOTSPOT_DNS_NAME", "LBBS_API_BASE_URL", "LBBS_ROUTER_TOKEN", "SYNC_INTERVAL", "HEARTBEAT_INTERVAL"]) expect(template).toContain(`{{${placeholder}}}`);
    expect(template).not.toContain("reset-configuration");
    expect(template).toContain("shared-users=1");
    expect(template).toContain("http-chap,mac-cookie");
  });

  it("sincroniza por HTTPS, crea usuarios deshabilitados y confirma cada comando", async () => {
    const sync = await read("routeros/hotspot/scripts/lbbs-sync.rsc");
    expect(sync).toContain("/api/wifi/router/pull");
    expect(sync).toContain("/api/wifi/router/ack");
    expect(sync).toContain("Authorization: Bearer");
    expect(sync).toContain(":deserialize from=json");
    expect(sync).toContain("disabled=yes");
    expect(sync).toContain("CREATE_VOUCHER");
    expect(sync).not.toContain(":log info $password");
  });

  it("deja heartbeat separado y sin sesiones", async () => {
    const heartbeat = await read("routeros/hotspot/scripts/lbbs-heartbeat.rsc");
    expect(heartbeat).toContain("/api/wifi/router/heartbeat");
    expect(heartbeat).toContain("routerosVersion");
    expect(heartbeat).not.toContain("activeSessions");
  });

  it("mantiene el portal local sin secretos, React o Next", async () => {
    const login = await read("routeros/hotspot/portal/login.html");
    const css = await read("routeros/hotspot/portal/styles.css");
    expect(login).toContain('maxlength="8"');
    expect(login).toContain('maxlength="9"');
    expect(login).toContain("$(chap-id)");
    expect(login).toContain("$(link-login-only)");
    expect(login).not.toContain("NEXT_PUBLIC");
    expect(login).not.toContain("LBBS_ROUTER_TOKEN");
    expect(login).not.toMatch(/react|next\.js/i);
    expect(css).not.toMatch(/https?:\/\//);
  });
});
