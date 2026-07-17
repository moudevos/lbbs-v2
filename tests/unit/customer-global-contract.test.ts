import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("contrato global de clientes", () => {
  it("no conserva SQL 112 como parche ejecutable", async () => {
    await expect(
      readFile(path.resolve(process.cwd(), "src/sql/112_customer_branch_rls_guard.sql"), "utf8"),
    ).rejects.toThrow();
  });

  it("la API de edicion no toma campos internos del payload", async () => {
    const source = await readFile(
      path.resolve(process.cwd(), "src/app/api/admin/customers/[id]/route.ts"),
      "utf8",
    );

    const updateBlock = source.slice(source.indexOf('.from("customers")'));
    expect(updateBlock).not.toContain("payload?.source");
    expect(updateBlock).not.toContain("payload?.is_active");
  });
});
