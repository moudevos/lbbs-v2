import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = path.join(
  root,
  "supabase/migrations/20261014012042_employee_debt_creation_idempotency.sql",
);

describe("idempotencia de creación manual de deudas", () => {
  it("mantiene la intención de UI durante un retry y bloquea el doble submit", async () => {
    const client = await readFile(
      path.join(root, "src/features/employees/EmployeeDebtsPageClient.tsx"),
      "utf8",
    );

    expect(client).toContain(
      "const [isSubmitting, setIsSubmitting] = useState(false);",
    );
    expect(client).toContain(
      "const [creationRequestId, setCreationRequestId] = useState<string | null>(",
    );
    expect(client).toContain("const submitLockRef = useRef(false);");
    expect(client).toContain("setCreationRequestId(crypto.randomUUID());");
    expect(client).toContain(
      "if (isCreatingDebt && (isSubmitting || submitLockRef.current)) return;",
    );
    expect(client).toContain("idempotencyKey: creationRequestId");
    expect(client).toContain('"Guardando..."');
    expect(client).toContain("disabled={!canSubmitDebt || isSubmitting}");
    expect(client).toContain("closeOnOutsideClick={!isSubmitting}");
  });

  it("exige y valida la key de idempotencia antes de invocar la RPC", async () => {
    const route = await readFile(
      path.join(root, "src/app/api/admin/employee-debts/route.ts"),
      "utf8",
    );

    expect(route).toContain("IDEMPOTENCY_KEY_REQUIRED");
    expect(route).toContain("IDEMPOTENCY_KEY_INVALID");
    expect(route).toContain('rpc("create_employee_debt_idempotent_v1"');
    expect(route).toContain("p_idempotency_key: idempotency.key");
    expect(route).toContain('p_funding_origin: "pos_cash"');
    expect(route).toContain("IDEMPOTENCY_KEY_PAYLOAD_MISMATCH");
    expect(route).toContain("{ status: 409 }");
  });

  it("serializa por key, rechaza payload distinto y reutiliza solo una deuda", async () => {
    const sql = await readFile(migration, "utf8");

    expect(sql).toContain(
      "create table public.employee_debt_creation_requests",
    );
    expect(sql).toContain(
      "alter table public.employee_debt_creation_requests enable row level security",
    );
    expect(sql).toContain(
      "revoke all on table public.employee_debt_creation_requests from public, anon, authenticated",
    );
    expect(sql).toContain("extensions.digest(");
    expect(sql).toContain(
      "pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0))",
    );
    expect(sql).toContain("IDEMPOTENCY_KEY_PAYLOAD_MISMATCH");
    expect(sql).toContain("'idempotentReplay', true");
    expect(sql).toContain("'idempotentReplay', false");
    expect(sql).toContain("create_employee_debt_with_disbursements_v2");
    expect(sql).toContain("create_employee_debt_from_pos_cash_v2");
    expect(sql).toContain("create_employee_debt_with_disbursements(");
  });

  it("incluye una consulta diagnóstica no destructiva para duplicados históricos", async () => {
    const qa = await readFile(
      path.join(root, "src/sql/qa/find_employee_debt_duplicate_candidates.sql"),
      "utf8",
    );

    expect(qa).toContain("DIAGNÓSTICO ÚNICAMENTE");
    expect(qa).toContain("NO REPARA NI ELIMINA DEUDAS");
    expect(qa).toContain("interval '5 seconds'");
    expect(qa).toContain("seconds_apart");
    expect(qa).not.toMatch(/\b(delete|update|insert)\b/i);
  });
});
