import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
  .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line)).map((line) => {
    const index = line.indexOf("="); return [line.slice(0, index), line.slice(index + 1).trim().replace(/^['\"]|['\"]$/g, "")];
  }));
if (!/^(1|true|yes)$/i.test(env.QA_ALLOW_WRITES ?? "") || !/^(1|true|yes)$/i.test(env.QA_RESET_CONFIRMED ?? "")) throw new Error("QA cleanup flags are not enabled.");
const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const actor = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const login = await actor.auth.signInWithPassword({ email: env.QA_EMAIL, password: env.QA_PASSWORD });
if (login.error) throw new Error(login.error.message);
const employees = await service.from("employees").select("id").ilike("full_name", "QA_183_%");
if (employees.error) throw new Error(employees.error.message);
const ids = (employees.data ?? []).map((row) => row.id);
const debts = ids.length ? await service.from("employee_debts").select("id,status").in("employee_id", ids).in("status", ["pending", "partial"]) : { data: [], error: null };
if (debts.error) throw new Error(debts.error.message);
let reverted = 0; let failures = 0;
for (const debt of debts.data ?? []) {
  const response = await actor.rpc("waive_employee_debt", { p_debt_id: debt.id, p_reason: "QA_183 cleanup after controlled test" });
  if (response.error) failures += 1; else reverted += 1;
}
const inactive = ids.length ? await service.from("employees").update({ status: "inactive" }).in("id", ids) : { error: null };
if (inactive.error) failures += 1;
await actor.auth.signOut();
console.log(`[QA CLEANUP] employees=${ids.length}; debts_reverted=${reverted}; failures=${failures}`);
process.exitCode = failures ? 1 : 0;
