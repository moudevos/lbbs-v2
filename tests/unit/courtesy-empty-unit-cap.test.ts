import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("tope unitario opcional de cortesías", () => {
  it("guarda un campo vacío como sin tope, no como S/ 0", async () => {
    const route = await readFile(path.resolve(root, "src/app/api/admin/courtesy-rules/route.ts"), "utf8");

    expect(route).toContain("function optionalMoney");
    expect(route).toContain('typeof value === "string" && value.trim() === ""');
    expect(route).toContain("max_unit_amount: optionalMoney(benefit.maxUnitAmount)");
  });

  it("repara topes cero históricos para que representen sin tope", async () => {
    const migration = await readFile(
      path.resolve(root, "supabase/migrations/20260822215452_courtesy_empty_unit_cap_as_null.sql"),
      "utf8",
    );

    expect(migration).toContain("set max_unit_amount = null");
    expect(migration).toContain("and max_unit_amount = 0");
  });
});
