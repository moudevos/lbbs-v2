import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("acceso de recepción a producción", () => {
  it("restringe la consulta a su sede y conserva la generación para admin/owner", async () => {
    const route = await readFile(
      path.resolve(process.cwd(), "src/app/api/admin/production/route.ts"),
      "utf8",
    );

    expect(route).toContain("requireTeamBranchSession()");
    expect(route).toContain('auth.role === "reception" ? (auth.branchId ?? "")');
    expect(route).toContain("permissions: { canGenerate: auth.role !== \"reception\" }");
    expect(route).toContain("const auth = await requireAdminSession();");
  });
});
