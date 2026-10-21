import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = (file: string) =>
  readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");

const earlierOneDeviceMigration = source("supabase/migrations/20261021141000_hotspot_staff_one_device_safe.sql");
const limit = source("supabase/migrations/20261021144500_hotspot_staff_two_devices_safe.sql");
const panel = source("src/features/wifi/WifiStaffPanel.tsx");
const adminApi = source("src/app/api/admin/wifi/staff/route.ts");
const provision = source("src/app/api/wifi/router/staff/authorize/route.ts");

describe("LBBS WiFi Staff staged two-device safety", () => {
  it("restores a two-device cap without deleting data or relaxing concurrency", () => {
    expect(earlierOneDeviceMigration).toContain("v_authorized >= 1");
    expect(limit).toContain("having count(*) > 2");
    expect(limit).toContain("drop index if exists public.hotspot_staff_one_authorized_device_uidx");
    expect(limit).toContain("v_authorized >= 2");
    expect(limit).toContain("for update");
    expect(limit).toContain("new.mac_address := upper(new.mac_address)");
    expect(limit).not.toContain("delete from public.hotspot_staff_devices");
    expect(limit).not.toContain("update public.wifi_access_vouchers");
  });

  it("displays 2 slots in Staff Dashboard and correct errors in admin API", () => {
    expect(panel).toContain("} / 2</span>");
    expect(panel).toContain("length >= 2");
    expect(panel).toContain("Hasta dos dispositivos autorizados");
    expect(panel).not.toContain("} / 1</span>");
    expect(adminApi).toContain("23505");
    expect(adminApi).toContain("máximo de dos dispositivos autorizados");
  });

  it("retains router-authentication feature gating and never opens captive access prematurely", () => {
    expect(provision).toContain('process.env.LBBS_STAFF_ROUTER_AUTH_ENABLED !== "true"');
    expect(provision).toContain("authenticateRouter(request)");
    expect(provision).toContain("provisioned: false");
  });
});
