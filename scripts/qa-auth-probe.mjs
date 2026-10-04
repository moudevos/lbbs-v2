import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
  .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line)).map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index), line.slice(index + 1).trim().replace(/^['\"]|['\"]$/g, "")];
  }));
const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const login = await client.auth.signInWithPassword({ email: env.QA_EMAIL, password: env.QA_PASSWORD });
if (login.error) throw new Error(login.error.message);
const user = await client.auth.getUser();
const employee = await client.from("employees").select("id,role,branch_id,status").eq("user_id", user.data.user.id).maybeSingle();
if (employee.error) throw new Error(employee.error.message);
console.log(`[QA AUTH] employee linked: ${Boolean(employee.data)}; role: ${employee.data?.role ?? "none"}; branch assigned: ${Boolean(employee.data?.branch_id)}; status: ${employee.data?.status ?? "none"}`);
await client.auth.signOut();
