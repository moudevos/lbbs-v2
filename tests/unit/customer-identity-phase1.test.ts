import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

describe("customer identity phase 1 boundary", () => {
  it("uses a post-147 correction without recreating Phase 1 tables", () => {
    const migration = read("src/sql/148_customer_identity_phase1_corrections.sql");
    expect(migration).toContain("get_customer_link_status");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).not.toContain("create table if not exists public.customer_accounts");
    expect(migration).not.toContain("create table if not exists public.customer_link_requests");
  });

  it("keeps customer OAuth and public rewards routes out of the dashboard", () => {
    const sidebar = read("src/components/layout/Sidebar.tsx");
    expect(sidebar).toContain('href: "/control/clientes/vinculaciones"');
    expect(sidebar).not.toContain('href: "/rewards/login"');
  });

  it("offers the audited physical migration from the customer list", () => {
    const panel = read("src/features/customers/customers-panel.tsx");
    expect(panel).not.toContain("physical-rewards-migration");
    expect(panel).not.toContain("Sellos físicos");
  });
});
