import crypto from "node:crypto";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
  .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line)).map((line) => {
    const index = line.indexOf("="); let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    return [line.slice(0, index), value];
  }));
if (!/^(1|true|yes)$/i.test(env.QA_ALLOW_WRITES ?? "") || !/^(1|true|yes)$/i.test(env.QA_RESET_CONFIRMED ?? "")) throw new Error("QA mutation flags are not enabled.");

const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const actor = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const marker = `QA_183_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
const outcome = { marker, created: [], tests: [], cleanup: [] };
function log(label, state, extra = {}) { outcome.tests.push({ label, state, ...extra }); console.log(`[QA MUTATION] ${label}: ${state}`); }
function fail(message) { throw new Error(message); }
console.log(`[QA MUTATION] marker=${marker}`);

const login = await actor.auth.signInWithPassword({ email: env.QA_EMAIL, password: env.QA_PASSWORD });
if (login.error) fail(`QA owner authentication failed: ${login.error.message}`);
let fixtureEmployeeId = null;
let fixtureUserId = null;
const debtIds = [];
try {
  const [{ data: branches, error: branchError }, { data: methods, error: methodError }] = await Promise.all([
    actor.from("branches").select("id").eq("is_active", true).limit(1),
    actor.from("payment_methods").select("id,counts_as_cash").eq("is_active", true).eq("counts_as_cash", false).limit(3),
  ]);
  if (branchError || !branches?.[0]) fail(branchError?.message ?? "No active branch for QA fixture.");
  if (methodError || (methods?.length ?? 0) < 2) fail(methodError?.message ?? "Two non-cash payment methods are required for QA fixture.");
  const branchId = branches[0].id;
  const [methodA, methodB] = methods;
  const email = `${marker.toLowerCase()}@qa.invalid`;
  const createdUser = await service.auth.admin.createUser({ email, password: crypto.randomBytes(24).toString("base64url"), email_confirm: true });
  if (createdUser.error || !createdUser.data.user) fail(createdUser.error?.message ?? "Could not create QA auth user.");
  fixtureUserId = createdUser.data.user.id;
  const employee = await service.from("employees").insert({ user_id: fixtureUserId, branch_id: branchId, full_name: marker, role: "barber", status: "active" }).select("id").single();
  if (employee.error || !employee.data) fail(employee.error?.message ?? "Could not create QA employee.");
  fixtureEmployeeId = employee.data.id; outcome.created.push({ type: "employee", id: fixtureEmployeeId });

  const advance = await actor.rpc("create_employee_debt_with_disbursements", { p_employee_id: fixtureEmployeeId, p_branch_id: branchId, p_debt_type: "advance", p_amount: 100, p_description: `${marker} advance`, p_disbursements: [{ paymentMethodId: methodA.id, amount: 60 }, { paymentMethodId: methodB.id, amount: 40 }] });
  if (advance.error || !advance.data) fail(advance.error?.message ?? "Advance RPC failed.");
  debtIds.push(advance.data.id); outcome.created.push({ type: "advance", id: advance.data.id });
  const [advanceDebt, advanceDisbursements, advancePosting] = await Promise.all([
    service.from("employee_debts").select("original_amount,outstanding_amount,status").eq("id", advance.data.id).single(),
    service.from("employee_debt_disbursements").select("id,amount").eq("debt_id", advance.data.id),
    service.from("financial_postings").select("id,amount,affects_profit,financial_group").eq("source_id", advance.data.id).eq("source_type", "employee_debt"),
  ]);
  const advancePass = !advanceDebt.error && Number(advanceDebt.data.original_amount) === 100 && Number(advanceDebt.data.outstanding_amount) === 100 && (advanceDisbursements.data?.length ?? 0) === 2 && (advancePosting.data ?? []).some((row) => Number(row.amount) === 100 && row.affects_profit === false && row.financial_group === "receivable");
  log("Advance 100 / two disbursements", advancePass ? "PASS" : "FAIL", { debt: advanceDebt.data, disbursements: advanceDisbursements.data?.length ?? 0, postings: advancePosting.data?.length ?? 0 });

  const badSumBefore = await service.from("employee_debts").select("id", { count: "exact", head: true }).ilike("description", `${marker}%bad-sum%`);
  const badSum = await actor.rpc("create_employee_debt_with_disbursements", { p_employee_id: fixtureEmployeeId, p_branch_id: branchId, p_debt_type: "advance", p_amount: 100, p_description: `${marker} bad-sum`, p_disbursements: [{ paymentMethodId: methodA.id, amount: 50 }, { paymentMethodId: methodB.id, amount: 30 }] });
  const badSumAfter = await service.from("employee_debts").select("id", { count: "exact", head: true }).ilike("description", `${marker}%bad-sum%`);
  log("Advance incorrect sum rejected", badSum.error && (badSumBefore.count ?? 0) === (badSumAfter.count ?? 0) ? "PASS" : "FAIL", { error: badSum.error?.message ?? null, before: badSumBefore.count ?? 0, after: badSumAfter.count ?? 0 });

  const duplicate = await actor.rpc("create_employee_debt_with_disbursements", { p_employee_id: fixtureEmployeeId, p_branch_id: branchId, p_debt_type: "advance", p_amount: 100, p_description: `${marker} duplicate-method`, p_disbursements: [{ paymentMethodId: methodA.id, amount: 50 }, { paymentMethodId: methodA.id, amount: 50 }] });
  if (duplicate.data?.id) { debtIds.push(duplicate.data.id); outcome.created.push({ type: "duplicate-method-attempt", id: duplicate.data.id }); }
  log("Duplicate disbursement method rejected", duplicate.error ? "PASS" : "FAIL", { error: duplicate.error?.message ?? null, createdDebtId: duplicate.data?.id ?? null });

  const penalty = await actor.rpc("create_employee_debt_with_disbursements", { p_employee_id: fixtureEmployeeId, p_branch_id: branchId, p_debt_type: "penalty", p_amount: 30, p_description: `${marker} penalty`, p_disbursements: [] });
  if (penalty.error || !penalty.data) {
    log("Penalty receivable", "FAIL", { debt: null, error: penalty.error?.message ?? "Penalty RPC returned no record." });
  } else {
    debtIds.push(penalty.data.id); outcome.created.push({ type: "penalty", id: penalty.data.id });
    const penaltyCheck = await service.from("employee_debts").select("original_amount,outstanding_amount").eq("id", penalty.data.id).single();
    log("Penalty receivable", !penaltyCheck.error && Number(penaltyCheck.data.original_amount) === 30 && Number(penaltyCheck.data.outstanding_amount) === 30 ? "PASS" : "FAIL", { debt: penaltyCheck.data ?? null, error: penaltyCheck.error?.message ?? null });
  }

  const payment = await actor.rpc("apply_employee_debt_payment", { p_debt_id: advance.data.id, p_amount: 50, p_movement_type: "manual_payment", p_notes: `${marker} recovery`, p_payment_method_id: methodA.id, p_payment_reference: marker });
  if (payment.error) fail(payment.error.message);
  const [afterPayment, ledger] = await Promise.all([
    service.from("employee_debts").select("outstanding_amount,status").eq("id", advance.data.id).single(),
    service.from("vw_employee_debt_ledger").select("signed_amount,event_type").eq("debt_id", advance.data.id),
  ]);
  log("Debt recovery and ledger", !afterPayment.error && Number(afterPayment.data.outstanding_amount) === 50 && (ledger.data ?? []).some((row) => Number(row.signed_amount) === -50) ? "PASS" : "FAIL", { outstanding: afterPayment.data?.outstanding_amount ?? null, entries: ledger.data?.length ?? 0, error: afterPayment.error?.message ?? ledger.error?.message ?? null });
} finally {
  for (const debtId of debtIds) {
    const existing = await service.from("employee_debts").select("status,outstanding_amount").eq("id", debtId).maybeSingle();
    if (existing.data && ["pending", "partial"].includes(existing.data.status)) {
      const reversal = await actor.rpc("waive_employee_debt", { p_debt_id: debtId, p_reason: `${marker} QA cleanup` });
      outcome.cleanup.push({ type: "debt", id: debtId, state: reversal.error ? "FAIL" : "REVERTED", error: reversal.error?.message ?? null });
    }
  }
  if (fixtureEmployeeId) {
    const inactive = await service.from("employees").update({ status: "inactive" }).eq("id", fixtureEmployeeId);
    outcome.cleanup.push({ type: "employee", id: fixtureEmployeeId, state: inactive.error ? "FAIL" : "INACTIVATED", error: inactive.error?.message ?? null });
  }
  await actor.auth.signOut();
}
fs.mkdirSync(".qa", { recursive: true });
fs.writeFileSync(`.qa/${marker}-mutation.json`, `${JSON.stringify(outcome, null, 2)}\n`);
const finalPath = ".qa/phase-1a-1b-final.json";
if (fs.existsSync(finalPath)) {
  const final = JSON.parse(fs.readFileSync(finalPath, "utf8"));
  final.mutationQa = outcome;
  fs.writeFileSync(finalPath, `${JSON.stringify(final, null, 2)}\n`);
}
const failed = outcome.tests.filter((test) => test.state === "FAIL").length + outcome.cleanup.filter((item) => item.state === "FAIL").length;
console.log(`[QA MUTATION] marker=${marker}; failures=${failed}; cleanup=${outcome.cleanup.map((item) => item.state).join(",")}`);
process.exitCode = failed ? 1 : 0;
