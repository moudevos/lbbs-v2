import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "src/sql/20261017014026_settlement_gross_production_mandatory_discount.sql"),
  "utf8",
);
const detail = readFileSync(
  resolve(process.cwd(), "src/features/settlements/SettlementDetailPageClient.tsx"),
  "utf8",
);
const summary = readFileSync(
  resolve(process.cwd(), "src/features/settlements/settlement-document-summary.ts"),
  "utf8",
);
const pdf = readFileSync(
  resolve(process.cwd(), "src/features/settlements/EmployeeSettlementPdf.tsx"),
  "utf8",
);

describe("gross production mandatory discount", () => {
  it("snapshots gross production from services plus attributed products", () => {
    expect(migration).toContain("gross_production_total numeric(12,2)");
    expect(migration).toContain("original_line_total_snapshot");
    expect(migration).toContain("commercial_amount_snapshot");
    expect(migration).toContain("then round(v_gross_production, 2)");
  });

  it("keeps commissionable base independent from mandatory discount base", () => {
    expect(migration).toContain("commissionable_base_total =");
    expect(migration).toContain("round(v_commissionable, 2)");
    expect(migration).toContain("mandatory_discount_base_amount =");
    expect(migration).toContain("gross_production_total =");
  });

  it("backfills only active non-historical settlements", () => {
    expect(migration).toContain("settlement.status in ('draft', 'review', 'approved')");
    const backfill = migration.slice(migration.indexOf("with gross as ("));
    expect(backfill).not.toContain("settlement.status in ('paid'");
    expect(backfill).not.toContain("settlement.status in ('cancelled'");
  });

  it("renders the six-card payment header with gross production first", () => {
    expect(detail).toContain('label: "Total producido"');
    expect(detail).toContain("value: summary.grossProduction");
    expect(detail).toContain("xl:grid-cols-6");
    expect(detail).toContain("% sobre total producido");
  });

  it("uses commercial product snapshots and readable gross-production labels", () => {
    expect(summary).toContain("commercial_amount_snapshot");
    expect(summary).toContain("grossProduction");
    expect(summary).toContain("% sobre total producido");
    expect(pdf).toContain('["Total producido", summary.grossProduction]');
  });
});
