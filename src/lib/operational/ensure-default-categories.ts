import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

const cashCategories = [
  { code: "operational_income", name: "Ingreso operativo", description: "Ingreso manual fuera de ventas.", movement_direction: "income", sort_order: 1, is_active: true },
  { code: "operational_expense", name: "Egreso operativo", description: "Egreso manual fuera de ventas.", movement_direction: "expense", sort_order: 2, is_active: true },
  { code: "cash_withdrawal", name: "Retiro de efectivo", description: "Salida de efectivo de caja.", movement_direction: "expense", sort_order: 3, is_active: true },
  { code: "cash_adjustment", name: "Ajuste de caja", description: "Ajuste manual de caja operativa.", movement_direction: "adjustment", sort_order: 4, is_active: true },
  { code: "petty_purchase", name: "Compra menor", description: "Compra operativa menor pagada desde caja.", movement_direction: "expense", sort_order: 5, is_active: true },
] as const;

const financeCategories = [
  { name: "Otros ingresos", code: "other_income", direction: "income", sort_order: 100, is_active: true },
  { name: "Gastos operativos", code: "operating_expense", direction: "expense", sort_order: 100, is_active: true },
] as const;

async function ensureRows(
  table: "cash_movement_categories" | "finance_categories",
  requiredCodes: readonly string[],
  rows: readonly Record<string, unknown>[],
) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from(table).select("code").in("code", [...requiredCodes]);
  if (error) throw error;

  const existing = new Set((data ?? []).map((item) => String(item.code)));
  const missing = rows.filter((item) => !existing.has(String(item.code)));
  if (missing.length === 0) return false;

  const { error: upsertError } = await admin.from(table).upsert(missing, { onConflict: "code" });
  if (upsertError) throw upsertError;
  return true;
}

export function ensureDefaultCashCategories() {
  return ensureRows(
    "cash_movement_categories",
    cashCategories.map((item) => item.code),
    cashCategories,
  );
}

export function ensureDefaultFinanceCategories() {
  return ensureRows(
    "finance_categories",
    financeCategories.map((item) => item.code),
    financeCategories,
  );
}
