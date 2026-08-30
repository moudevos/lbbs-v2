import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("análisis financiero separado", () => {
  it("separa ventas, aporte operativo, costos de cortesía y gastos reales", async () => {
    const route = await readFile(
      path.resolve(root, "src/app/api/admin/finance/analysis/route.ts"),
      "utf8",
    );

    expect(route).toContain("requireAdminSession");
    expect(route).toContain('eq("status", "completed")');
    expect(route).toContain('gte("accounting_date", dateFrom!)');
    expect(route).toContain("operational_contribution_amount");
    expect(route).toContain("courtesyReserve");
    expect(route).toContain("courtesyCost");
    expect(route).toContain("expensesByCategory");
    expect(route).toContain("operatingResult");
  });

  it("mantiene libro, análisis configurable y categorías financieras explícitas", async () => {
    const [finance, analysis, migration] = await Promise.all([
      readFile(
        path.resolve(root, "src/features/finance/FinancePageClient.tsx"),
        "utf8",
      ),
      readFile(
        path.resolve(
          root,
          "src/features/finance/FinancialAnalysisPageClient.tsx",
        ),
        "utf8",
      ),
      readFile(
        path.resolve(
          root,
          "src/sql/146_finance_classification_and_analysis.sql",
        ),
        "utf8",
      ),
    ]);

    expect(finance).toContain("Registrar movimiento");
    expect(finance).toContain("Concepto");
    expect(finance).toContain("Descripción del movimiento");
    expect(analysis).toContain("Estado de cuenta");
    expect(analysis).toContain("Aporte operativo generado");
    expect(analysis).toContain("Costo real de cortesías");
    expect(analysis).toContain("Ventas por barbero y día");
    expect(analysis).toContain("lbbs-finance-analysis-charts");
    expect(migration).toContain("financial_group");
    expect(migration).toContain("employee_advance");
    expect(migration).toContain("rent");
  });
});
