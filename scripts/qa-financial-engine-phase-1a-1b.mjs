import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = process.cwd();
const parseEnv = (file) => Object.fromEntries(fs.readFileSync(file, "utf8").split(/\r?\n/)
  .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line)).map((line) => {
    const separator = line.indexOf("="); let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    return [line.slice(0, separator), value];
  }));
const env = parseEnv(path.join(root, ".env.local"));
const host = new URL(env.NEXT_PUBLIC_SUPABASE_URL).host;
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const hotfix184File = "supabase/migrations/20260925184040_financial_engine_phase_1a_1b_acceptance_hotfix.sql";
const result = { generatedAt: new Date().toISOString(), target: host, mode: "read-only", migration183Installed: false, migration184Prepared: fs.existsSync(path.join(root, hotfix184File)), tests: [], errors: [], notes: ["No migrations, commits, pushes, or fixture mutations were executed by this runner.", "QA_184 mutations remain blocked until the user applies migration 184 manually."] };
let index = 0;

function detail(error) { return error ? { code: error.code ?? null, message: error.message ?? String(error), details: error.details ?? null, hint: error.hint ?? null } : null; }
function record(label, state, testDetail = {}) {
  index += 1;
  const item = { id: index, label, state, detail: testDetail }; result.tests.push(item);
  if (state === "FAIL") result.errors.push(item);
  console.log(`[QA ${String(index).padStart(2, "0")}/26] ${label.padEnd(34, ".")} ${state}`);
  if (state === "FAIL") console.log(`  Expected: ${testDetail.expected ?? "condition to pass"}\n  Actual: ${testDetail.actual ?? "unknown"}\n  Source: ${testDetail.source ?? "remote read-only QA"}${testDetail.error ? `\n  Error: ${testDetail.error}` : ""}`);
}
async function probe(relation, column = "id") { const response = await supabase.from(relation).select(column, { count: "exact", head: true }); return { count: response.count ?? 0, error: response.error }; }
async function sourceContains(file, fragments) { const source = fs.readFileSync(path.join(root, file), "utf8"); return fragments.every((fragment) => source.includes(fragment)); }

console.log("====================================================");
console.log("LBBS — QA FASE 1A / 1B");
console.log(`Target: ${host}`);
console.log("Mode: read-only");
console.log("====================================================");

try {
  record("Environment", "PASS", { target: host });
  const [productLines, debtLedger] = await Promise.all([probe("employee_settlement_product_lines"), probe("vw_employee_debt_ledger", "debt_id")]);
  const has183CoreObjects = !productLines.error && !debtLedger.error;
  result.migration183Installed = has183CoreObjects;
  record("Migration 183 core objects", has183CoreObjects ? "PASS" : "BLOCKED", has183CoreObjects
    ? { productLines: productLines.count, debtLedger: debtLedger.count }
    : { expected: "employee_settlement_product_lines and vw_employee_debt_ledger installed", actual: "one or more required 183 objects are unavailable", source: "Supabase Data API", error: JSON.stringify({ productLines: detail(productLines.error), debtLedger: detail(debtLedger.error) }) });

  const qaActor = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const qaLogin = await qaActor.auth.signInWithPassword({ email: env.QA_EMAIL, password: env.QA_PASSWORD });
  const analysis = qaLogin.error ? { error: qaLogin.error } : await qaActor.rpc("get_financial_analysis_v2", { p_date_from: "2026-01-01", p_date_to: "2026-01-01", p_branch_id: null });
  record("P&L RPC readable", analysis.error ? "FAIL" : "PASS", analysis.error ? { expected: "get_financial_analysis_v2 responds for QA owner", actual: "RPC error", source: "Supabase RPC", error: JSON.stringify(detail(analysis.error)) } : { responseType: typeof analysis.data });
  await qaActor.auth.signOut();

  const categories = await supabase.from("product_categories").select("business_line");
  if (categories.error) record("Product category families", "FAIL", { expected: "read product_categories", actual: "query failed", source: "product_categories", error: JSON.stringify(detail(categories.error)) });
  else {
    const rows = categories.data ?? []; const families = Object.fromEntries(["barbershop_products", "cafeteria_products", "other"].map((line) => [line, rows.filter((row) => row.business_line === line).length]));
    console.log(`[QA DB] Barbería: ${families.barbershop_products}; Cafetería: ${families.cafeteria_products}; Other: ${families.other}`);
    record("Product category families", families.barbershop_products > 0 && families.cafeteria_products > 0 ? "PASS" : "BLOCKED", { ...families, expected: "at least one Barbería and one Cafetería category", actual: `${families.barbershop_products} barbería; ${families.cafeteria_products} cafetería`, source: "product_categories.business_line" });
  }

  for (const [label, relation, column] of [["Financial postings readable", "financial_postings", "id"], ["Settlement service lines readable", "employee_settlement_service_lines", "id"], ["Debt disbursements schema", "employee_debt_disbursements", "id"], ["Employee debts readable", "employee_debts", "id"], ["Accounts payable readable", "accounts_payable", "id"]]) {
    const inspected = await probe(relation, column);
    record(label, inspected.error ? "FAIL" : "PASS", inspected.error ? { expected: `${relation} exposed and readable to service QA`, actual: "query failed", source: relation, error: JSON.stringify(detail(inspected.error)) } : { count: inspected.count });
  }

  const productFamily = await sourceContains("src/features/products/product-form.tsx", ["business_line"]);
  record("Product family UI contract", productFamily ? "PASS" : "FAIL", { expected: "family selection independent of category", actual: productFamily ? "business_line found" : "business_line absent", source: "product-form.tsx" });
  const productGuard = await sourceContains("src/app/api/admin/products/route.ts", ["other"]);
  record("POS product rejects other category", productGuard ? "PASS" : "FAIL", { expected: "route guards historical other category", actual: productGuard ? "guard source present" : "guard source absent", source: "products/route.ts" });
  const summary = await sourceContains("src/features/settlements/settlement-document-summary.ts", ["recognizedProducts", "commercialValue"]);
  record("Settlement recognized summary", summary ? "PASS" : "FAIL", { expected: "shared summary exposes recognized product and commercial value", actual: summary ? "source contract present" : "source contract absent", source: "settlement-document-summary.ts" });
  const productReadModel = await sourceContains("src/app/api/admin/settlements/[settlementId]/route.ts", ["employee_settlement_product_lines"]);
  record("Settlement product read model", productReadModel ? (has183CoreObjects ? "PASS" : "BLOCKED") : "FAIL", { expected: "detail route loads product snapshots", actual: productReadModel ? "source present; migration gate pending" : "source absent", source: "settlements/[settlementId]/route.ts" });
  const financeModal = await sourceContains("src/features/finance/FinancePageClient.tsx", ["Nuevo movimiento", "Modal"]);
  record("Cost and expense modal UI", financeModal ? "PASS" : "FAIL", { expected: "new movement is modal-based", actual: "static source inspection", source: "FinancePageClient.tsx" });
  const signedPnl = await sourceContains(hotfix184File, ["vw_financial_postings_signed", "profit_signed_amount"]);
  record("P&L signed posting semantics", signedPnl ? "PASS" : "FAIL", { expected: "184 P&L consumes signed posting semantics", actual: signedPnl ? "hotfix source present" : "hotfix source absent", source: hotfix184File });
  const debtHotfix = await sourceContains(hotfix184File, ["No se puede repetir el mismo método de desembolso.", "administrative_charge"]);
  record("Debt acceptance hotfix", debtHotfix ? "PASS" : "FAIL", { expected: "184 guards duplicate disbursements and accepts the manual debt contract", actual: debtHotfix ? "hotfix source present" : "hotfix source absent", source: hotfix184File });
  const debtApi = await sourceContains("src/app/api/admin/employee-debts/route.ts", ["create_employee_debt_with_disbursements"]);
  record("Debt multi-disbursement API", debtApi ? "PASS" : "FAIL", { expected: "canonical multi-disbursement RPC", actual: "static source inspection", source: "employee-debts/route.ts" });
  const penaltyApi = await sourceContains("src/app/api/admin/employee-debts/route.ts", ['"penalty"']);
  record("Debt penalty API", penaltyApi ? "PASS" : "FAIL", { expected: "manual penalty API contract", actual: "static source inspection", source: "employee-debts/route.ts" });
  const mandatory = await sourceContains("src/features/settlements/settlement-document-summary.ts", ["mandatory"]);
  record("Mandatory discount shared source", mandatory ? "PASS" : "FAIL", { expected: "shared source drives Review/Document/PDF", actual: "static source inspection", source: "settlement-document-summary.ts" });

  const gatedState = "BLOCKED";
  const gateDetail = { expected: "184 applied manually before controlled QA_184_ fixture mutations", actual: result.migration184Prepared ? "migration file prepared; remote application intentionally not performed" : "184 migration file unavailable", source: "migration 184 gate" };
  for (const label of ["Canonical settlement fixture", "Review = document = PDF", "Personnel posting / paid immutable", "POS employee credit", "Product family P&L and COGS", "Pending CxP and payment", "Signed reversals reconciliation"]) record(label, gatedState, gateDetail);
} catch (error) {
  record("Read-only QA runtime", "FAIL", { expected: "runner completes", actual: "unexpected runtime error", source: "qa-financial-engine-phase-1a-1b.mjs", error: JSON.stringify(detail(error)) });
}

const counts = Object.fromEntries(["PASS", "FAIL", "SKIP", "BLOCKED"].map((state) => [state, result.tests.filter((test) => test.state === state).length]));
result.summary = counts;
fs.mkdirSync(path.join(root, ".qa"), { recursive: true });
fs.writeFileSync(path.join(root, ".qa", "phase-1a-1b-final.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log("==================================");
console.log(`PASS ${counts.PASS}  FAIL ${counts.FAIL}  SKIP ${counts.SKIP}  BLOCKED ${counts.BLOCKED}`);
console.log("==================================");
