import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("exportación Excel de producción", () => {
  it("ofrece un libro XLSX para el equipo operativo", async () => {
    const route = await readFile(path.resolve(root, "src/app/api/admin/production/export/route.ts"), "utf8");

    expect(route).toContain("requireTeamBranchSession");
    expect(route).toContain('runtime = "nodejs"');
    expect(route).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(route).toContain("workbook.xlsx.writeBuffer()");
  });

  it("separa resumen, detalle, simulación y deudas en hojas con columnas propias", async () => {
    const route = await readFile(path.resolve(root, "src/app/api/admin/production/export/route.ts"), "utf8");

    expect(route).toContain('addWorksheet("Resumen por empleado"');
    expect(route).toContain('addWorksheet("Detalle de producción"');
    expect(route).toContain('addWorksheet("Simulación de cobros"');
    expect(route).toContain('addWorksheet("Deudas vigentes"');
    expect(route).toContain("Deuda restante");
    expect(route).toContain("Deducciones de deuda");
    expect(route).toContain("Deducción adicional (%)");
    expect(route).toContain("Cobro neto");
  });

  it("muestra el botón de exportación en el módulo de producción", async () => {
    const client = await readFile(path.resolve(root, "src/features/production/ProductionPageClient.tsx"), "utf8");

    expect(client).toContain("/api/admin/production/export?");
    expect(client).toContain("Exportar Excel");
  });
});
