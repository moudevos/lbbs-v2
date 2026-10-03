import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const file = path.resolve(process.cwd(), "src/components/layout/Sidebar.tsx");
async function sidebar() { return readFile(file, "utf8"); }

describe("sidebar definitivo", () => {
  it("mantiene Principal como enlace directo y no como accordion", async () => {
    const source = await sidebar();
    expect(source).toContain('label="Principal"');
    expect(source).not.toContain('{ id: "principal"');
  });
  it("retira solo las entradas de navegación histórica", async () => {
    const source = await sidebar();
    expect(source).toContain('!["sunday_sales", "employee_supplies"].includes(item.module)');
  });
  it("ordena administración, finanzas, herramientas y configuración", async () => {
    const source = await sidebar();
    expect(source).toContain('id: "administracion"');
    expect(source).toContain('id: "finanzas"');
    expect(source).toContain('modules: ["profit_loss", "finance", "financial_analysis"]');
    expect(source).toContain('id: "herramientas"');
    expect(source).toContain('{ id: "configuracion", label: "Configuración", modules: ["branches", "settings"] }');
  });
  it("persiste múltiples accordions sin forzar el grupo activo", async () => {
    const source = await sidebar();
    expect(source).toContain('useState<Set<string>>');
    expect(source).toContain('lbbs-sidebar-groups');
    expect(source).not.toContain('if (groupId === activeGroupId) return');
    expect(source).not.toContain('window.location.href');
  });
});
