import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sqlDirectory = path.join(root, "src", "sql");
const outputPath = path.join(sqlDirectory, "000_production_bootstrap.sql");

const sourceFiles = [
  "001_extensions.sql",
  "002_enums.sql",
  "003_core_tables.sql",
  "004_rls_helpers.sql",
  "005_rls_policies.sql",
  "006_seed_base.sql",
  "007_branches_team.sql",
  "010_services.sql",
  "020_customers.sql",
  "021_identity_lookup.sql",
  "022_customers_simplify.sql",
  "030_reservations.sql",
  "040_products_stock.sql",
  "050_pos_sales.sql",
  "052_sales_cash_change_patch.sql",
  "060_operational_settings.sql",
  "070_cash_operations.sql",
  "080_rewards.sql",
  "081_rewards_consumption_patch.sql",
  "082_products_custom_price_patch.sql",
  "083_services_custom_price_patch.sql",
  "085_pos_session_history_and_closure.sql",
  "086_payroll_periods.sql",
  "087_employee_production.sql",
  "088_employee_bonus_rules.sql",
  "089_employee_accounts.sql",
  "090_employee_benefits.sql",
  "091_employee_settlements.sql",
  "092_employee_compensation_functions.sql",
  "093_employee_compensation_rls.sql",
  "094_sale_documents_and_reward_guards.sql",
  "095_operational_contacts_and_reservations.sql",
  "096_sale_cancellation_reasons.sql",
  "097_sale_cancellation_schema_patch.sql",
  "098_sale_document_snapshots_schema_reload.sql",
  "099_sale_document_snapshots_actor_fk.sql",
  "100_courtesy_rules.sql",
  "101_payment_method_operational_properties.sql",
  "102_search_normalization.sql",
  "103_settlement_mandatory_discount.sql",
  "104_finance_manual_entries.sql",
  "105_payment_method_cash_semantics.sql",
  "106_settlement_review_adjustments.sql",
  "107_auth_password_security.sql",
  "108_pos_payment_integrity_patch.sql",
  "109_pos_checkout_idempotency.sql",
  "113_restore_global_customer_access.sql",
  "114_iteration_11_settlement_review_runtime.sql",
  "115_settlement_cash_availability.sql",
  "116_settlement_cash_movement_rls.sql",
  "117_settlement_finance_ledger.sql",
  "118_settlement_paid_transition_guard.sql",
  "119_pos_session_legacy_negative_closure.sql",
  "122_seed_barbers_by_branch.sql",
  "124_seed_catalog_services_products.sql",
  "125_seed_operational_select_options.sql",
];

const branchSeed = `
-- Sedes operativas base para produccion.
insert into public.branches (name, slug, code, short_name, city, is_active)
values
  ('LA BAJADITA RICARDO PALMA', 'la-bajadita-ricardo-palma', 'LB-SRP', 'Ricardo Palma', 'Iquitos', true),
  ('LA BAJADITA SAN JUAN', 'la-bajadita-san-juan', 'LB-SSJ', 'San Juan', 'San Juan Bautista', true)
on conflict (code) where code is not null do update
set name = excluded.name,
    slug = excluded.slug,
    short_name = excluded.short_name,
    city = excluded.city,
    is_active = excluded.is_active,
    updated_at = now();
`;

function removeHistoricalPolicies(sources) {
  const latestPolicySource = new Map();

  sources.forEach(({ fileName, source }) => {
    for (const match of source.matchAll(/^create policy "([^"]+)"[\s\S]*?;$/gim)) {
      latestPolicySource.set(match[1], fileName);
    }
  });

  return sources.map(({ fileName, source }) => ({
    fileName,
    source: source.replace(/^create policy "([^"]+)"[\s\S]*?;$/gim, (statement, policyName) => {
      if (latestPolicySource.get(policyName) === fileName) {
        return statement;
      }

      return `-- Policy historica omitida: ${policyName}. La definicion final se conserva mas adelante.`;
    }),
  }));
}

function normalizeSource(fileName, source) {
  let normalized = source.replace(/\r\n/g, "\n").trim();

  if (fileName === "010_services.sql") {
    normalized = normalized.replace(
      "  duration_minutes integer not null check (duration_minutes > 0),\n  is_active boolean not null default true,",
      "  duration_minutes integer not null check (duration_minutes > 0),\n  allow_custom_price boolean not null default false,\n  is_active boolean not null default true,",
    );
  }

  if ([
    "113_restore_global_customer_access.sql",
    "122_seed_barbers_by_branch.sql",
    "124_seed_catalog_services_products.sql",
    "125_seed_operational_select_options.sql",
  ].includes(fileName)) {
    normalized = normalized
      .replace(/^begin;\s*/im, "")
      .replace(/\s*commit;\s*/im, "\n");
  }

  return normalized;
}

const normalizedSources = await Promise.all(
  sourceFiles.map(async (fileName) => ({
    fileName,
    source: normalizeSource(fileName, await readFile(path.join(sqlDirectory, fileName), "utf8")),
  })),
);

const fragments = [];
for (const { fileName, source } of removeHistoricalPolicies(normalizedSources)) {
  fragments.push(`\n-- ============================================================================\n-- Fuente consolidada: ${fileName}\n-- ============================================================================\n${source}\n`);

  if (fileName === "007_branches_team.sql") {
    fragments.push(branchSeed);
  }
}

const header = `-- LBBS v2 - Instalador unico de base de datos de produccion.
-- Generado por scripts/build-production-sql.mjs. No editar este archivo a mano.
-- Ejecutar completo en Supabase SQL Editor sobre una base nueva.
--
-- Incluye: esquema, funciones, RLS, RPC, vistas, catalogos y seeds operativos.
-- Excluye: laboratorio QA, purgas, restauraciones, datos de prueba y correcciones historicas aisladas.
-- No crea usuarios Auth ni un owner. Crea primero el usuario owner en Supabase Auth
-- y registra su perfil de empleado owner despues de ejecutar este instalador.

begin;
`;

const footer = `
insert into public.app_settings (key, value, description)
values
  ('app.name', '"LBBS v2"'::jsonb, 'Nombre visible de la aplicacion.'),
  ('app.environment', '"production"'::jsonb, 'Instalacion base de produccion.')
on conflict (key) do update
set value = excluded.value,
    description = excluded.description,
    updated_at = now();

commit;

notify pgrst, 'reload schema';
`;

await writeFile(outputPath, `${header}${fragments.join("\n")}${footer}`, "utf8");
console.log(`Generado: ${path.relative(root, outputPath)}`);
