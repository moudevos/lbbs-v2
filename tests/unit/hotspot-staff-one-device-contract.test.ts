import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = (file: string) =>
  readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");

const limit = source("supabase/migrations/20261021141000_hotspot_staff_one_device_safe.sql");
const panel = source("src/features/wifi/WifiStaffPanel.tsx");
const adminApi = source("src/app/api/admin/wifi/staff/route.ts");
const provision = source("src/app/api/wifi/router/staff/authorize/route.ts");

describe("LBBS WiFi Staff staged one-device safety", () => {
  it("enforces max one authorized MAC in DB while preserving existing sessions", () => {
    expect(limit).toContain("having count(*) > 1");
    expect(limit).toContain("create unique index if not exists hotspot_staff_one_authorized_device_uidx");
    expect(limit).toContain("where is_authorized = true");
    expect(limit).toContain("v_authorized >= 1");
    expect(limit).toContain("for update");
    expect(limit).not.toContain("delete from public.hotspot_staff_devices");
    expect(limit).not.toContain("update public.wifi_access_vouchers");
  });

  it("gates UI to one device and informs operators this does not install RouterOS", () => {
    expect(panel).toContain("} / 1</span>");
    expect(panel).toContain("length  >= 1");
    expect(panel).toContain("El acceso a Internet requiere un HotSpot Staff separado");
    expect(panel).not.toContain("} / 2</span>");
    expect(adminApi).toContain("23505");
    expect(adminApi).toContain("un único dispositivo");
  });

  it("retains router-authentication feature gating and never opens captive access prematurely", () => {
    expect(provision).toContain('process.env.LBBS_STAFF_ROUTER_AUTH_ENABLED !== "true"');
    expect(provision).toContain("authenticateRouter(request)");
    expect(provision).toContain("provisioned: false");
  });
});
