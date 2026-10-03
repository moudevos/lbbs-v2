import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("final Phase 0/1A/1B UX contracts", () => {
  it("keeps cash debt disbursements auditable with or without an open POS", async () => {
    const sql = await readFile(path.join(root, "src/sql/170_release_pre_treasury.sql"), "utf8");
    expect(sql).toContain("cash_context");
    expect(sql).toContain("reconciliation_status");
    expect(sql).toContain("then 'external' else 'pos'");
    expect(sql).toContain("then 'pending' else 'reconciled'");
    expect(sql).toContain("La referencia es obligatoria para desembolsos digitales.");
    expect(sql).toContain("if v_method.payment_kind='cash' and v_session.id is not null then");
  });

  it("does not require closing notes or show production in POS close", async () => {
    const closeModal = await readFile(path.join(root, "src/features/pos/PosSessionCloseModal.tsx"), "utf8");
    expect(closeModal).not.toContain("Ventas por categoría y producción");
    expect(closeModal).not.toContain("requiresNotes");
    expect(closeModal).toContain("Observación del cierre (opcional)");
  });

  it("uses stable summary keys, local debt preview and snapshot sale groups", async () => {
    const [summary, detail, grouping] = await Promise.all([
      readFile(path.join(root, "src/features/settlements/settlement-document-summary.ts"), "utf8"),
      readFile(path.join(root, "src/features/settlements/SettlementDetailPageClient.tsx"), "utf8"),
      readFile(path.join(root, "src/features/settlements/settlement-production-grouping.ts"), "utf8"),
    ]);
    expect(summary).toContain("id: String(deduction.id");
    expect(detail).toContain("key={line.id}");
    expect(detail).toContain("const saleGroups = useMemo");
    expect(grouping).toContain("line.saleReference");
    expect(detail).toContain("Guardar borrador");
    expect(detail).toContain("Cambios sin guardar");
    expect(detail).not.toContain("scheduleDraftSave");
  });

  it("separates discarded drafts, hides technical codes, and fetches the PDF blob", async () => {
    const [sql, route, detail] = await Promise.all([
      readFile(path.join(root, "src/sql/170_release_pre_treasury.sql"), "utf8"),
      readFile(path.join(root, "src/app/api/admin/settlements/route.ts"), "utf8"),
      readFile(path.join(root, "src/features/settlements/SettlementDetailPageClient.tsx"), "utf8"),
    ]);
    expect(sql).toContain("DRAFT_DISCARDED");
    expect(route).toContain("cancellation_reason_code.is.null,cancellation_reason_code.neq.DRAFT_DISCARDED");
    expect(detail).toContain('{ action: "discard_draft" }');
    expect(detail).not.toContain("Código: ${value.code}");
    expect(detail).toContain('credentials: "include"');
    expect(detail).toContain("URL.createObjectURL");
    expect(detail).toContain("URL.revokeObjectURL");
  });
});
