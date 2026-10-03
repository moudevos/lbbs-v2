import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("cierre de Fase 1 del portal de clientes", () => {
  it("restringe Realtime al solicitante y publica únicamente la tabla necesaria", async () => {
    const sql = await readFile(path.resolve(root, "src/sql/150_customer_portal_state_history_realtime.sql"), "utf8");
    expect(sql).toContain("customer_link_requests_self_select");
    expect(sql).toContain("auth_user_id = (select auth.uid())");
    expect(sql).toContain("alter publication supabase_realtime add table public.customer_link_requests");
  });

  it("expone historial paginado sin aceptar customer_id del navegador", async () => {
    const sql = await readFile(path.resolve(root, "src/sql/150_customer_portal_state_history_realtime.sql"), "utf8");
    expect(sql).toContain("get_customer_reward_movements(p_limit integer default 20,p_offset integer default 0)");
    expect(sql).toContain("auth_user_id=auth.uid() and status='active'");
    expect(sql).toContain("physical_migration");
    expect(sql).not.toContain("p_customer_id");
  });

  it("el panel administrativo conserva el código sólo en la respuesta puntual", async () => {
    const panel = await readFile(path.resolve(root, "src/features/customers/CustomerLinkRequestsPanel.tsx"), "utf8");
    expect(panel).toContain("Regenerar código");
    expect(panel).toContain("navigator.clipboard.writeText(code)");
    expect(panel).toContain("filter=${selectedFilter}");
    expect(panel).not.toContain("localStorage");
  });
});
