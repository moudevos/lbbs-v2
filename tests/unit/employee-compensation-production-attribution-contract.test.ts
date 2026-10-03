import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const pathToSql = path.resolve(root, "src/sql/170_release_pre_treasury.sql");

async function sql() { return readFile(pathToSql, "utf8"); }

describe("Fase 1: remuneración y atribución individual", () => {
  it("mantiene exactamente los cuatro contratos nuevos y exige mensual para fijos", async () => {
    const source = await sql();
    expect(source).toContain("'commission_plus_bonus','commission_only','fixed_plus_bonus','fixed'");
    expect(source).toContain("base_monthly_salary > 0");
    expect(source).toContain("p_commission_rate is null");
  });

  it("guarda descuento obligatorio por perfil y lo basa en producción reconocida", async () => {
    const source = await sql();
    expect(source).toContain("mandatory_discount_enabled");
    expect(source).toContain("mandatory_discount_rate");
    expect(source).toContain("get_employee_recognized_production");
    expect(source).toContain("mandatory_discount_base_amount=case when");
    expect(source).not.toContain("mandatory_discount_base_amount=v_gross");
    expect(source).toContain("add column if not exists mandatory_discount_base_amount");
    expect(source).toContain("apply_settlement_mandatory_discount_v176");
    expect(source).toContain("else\n    new.recognized_production_amount:=greatest(coalesce(new.original_line_total,0),0)");
    expect(source).toContain("commissionable_base_total=round(v_commissionable,2)");
    expect(source).toContain("labor_cost_amount:=greatest(round(coalesce(new.gross_pay_amount,0)-new.mandatory_discount_amount,2),0)");
  });

  it("separa producción reconocida, aporte y base comisionable", async () => {
    const source = await sql();
    // Ejemplo contractual: reconocido 10, aporte 2, base 8, obligatorio 0.10.
    expect(source).toContain("sum(line.commissionable_amount),0) into v_commissionable");
    expect(source).toContain("mandatory_discount_base_amount=case when coalesce(v_term.mandatory_discount_enabled,false) then v_recognized else 0 end");
    expect(source).not.toContain("mandatory_discount_base_amount=v_commissionable");
  });

  it("reconoce costo laboral al aprobar, no al pagar ni al descontar deudas", async () => {
    const source = await sql();
    expect(source).toContain("create or replace function public.sync_settlement_personnel_cost()");
    expect(source).toContain("v_period.end_date");
    expect(source).toContain("coalesce(new.labor_cost_amount");
    expect(source).toContain("reverse_financial_posting(v_posting.id,'SOURCE_CANCELLED'");
  });

  it("mantiene las deudas fuera del costo laboral y conserva el neto separado", async () => {
    const source = await sql();
    expect(source).toContain("new.labor_cost_amount:=greatest(round(coalesce(new.gross_pay_amount,0)-new.mandatory_discount_amount,2),0)");
    expect(source).toContain("new.net_pay_amount:=greatest(new.labor_cost_amount-coalesce(new.debt_deduction_total,0)-coalesce(new.other_deduction_total,0),0)");
    expect(source).toContain("'debtRecoveries',new.debt_deduction_total");
  });

  it("congela la producción reconocida de cada línea de servicio", async () => {
    const source = await sql();
    expect(source).toContain("recognized_production_amount_snapshot numeric(12,2) not null default 0");
    expect(source).toContain("set recognized_production_amount_snapshot=production.recognized_production_amount");
  });

  it("requiere vendedor para barbería, permite cafetería sin responsable y conserva trazabilidad", async () => {
    const source = await sql();
    expect(source).toContain("barbershop_products' and v_responsible is null");
    expect(source).toContain("employee_sale_item_attributions");
    expect(source).toContain("if v_item.attributed_employee_id is null then continue");
    expect(source).toContain("capture_sale_item_responsible_employee");
  });

  it("reutiliza bonus existente y excluye el perfil fijo sin borrar atribución", async () => {
    const source = await sql();
    expect(source).toContain("employee_product_bonus_entries");
    expect(source).toContain("term.compensation_mode in ('fixed','commission_only')");
    expect(source).toContain("Perfil sin bonos remunerativos: venta atribuida solo para producción.");
  });

  it("es prospectiva, conserva el core existente y no modifica 175", async () => {
    const source = await sql();
    expect(source).toContain("production_attribution_starts_at");
    expect(source).toContain("prepare_employee_settlement_v174");
    expect(source).toContain("checkout_pos_sale_v175");
    expect(source).toContain("prepare_employee_settlement_v174");
    expect(source).not.toContain("delete from public.employee_settlements");
  });

  it.each([
    ["fixed plus bonus exige sueldo mensual", "p_compensation_type in ('fixed_plus_bonus','fixed') and coalesce(p_base_monthly_salary,0) <= 0"],
    ["fixed conserva sueldo mensual en snapshot", "base_monthly_salary_snapshot=v_term.base_monthly_salary"],
    ["el reemplazo conserva vigencia anterior", "set effective_to=p_effective_from-1"],
    ["la tasa de comision se exige solo al liquidar", "if p_commission_rate is null or p_commission_rate<0 or p_commission_rate>100"],
    ["el servicio usa employee service production", "from public.employee_service_production production"],
    ["un producto atribuible se persiste por linea", "sale_item_id uuid not null unique"],
    ["la atribucion usa periodo de planilla", "payroll_period_id uuid not null"],
    ["cafeteria sin responsable no genera atribucion", "if v_item.attributed_employee_id is null then continue"],
    ["barberia exige responsable en la RPC", "v_line='barbershop_products' and v_responsible is null"],
    ["un responsable inactivo no puede vender", "where id=v_responsible and status='active'"],
    ["un responsable de otra sede no puede atribuir una venta", "and (branch_id is null or branch_id=v_branch_id)"],
    ["productos entran a produccion reconocida", "sum(attribution.recognized_production_amount)"],
    ["rewards usa su base reconocida", "new.reward_commission_basis_amount"],
    ["las demas operaciones usan base reconocida", "new.recognized_production_amount:=greatest(coalesce(new.original_line_total,0),0)"],
    ["los bonos existentes se reutilizan", "employee_product_bonus_entries"],
    ["un fijo no recibe bono remunerativo", "Perfil sin bonos remunerativos: venta atribuida solo para producción."],
    ["commission plus bonus suma bonus", "v_term.compensation_mode in ('commission_plus_bonus','fixed_plus_bonus')"],
    ["solo comisiones no suma bonos", "if v_term.compensation_mode in ('commission_plus_bonus','fixed_plus_bonus') then"],
    ["solo comisiones sí exige porcentaje", "v_term.compensation_mode in ('commission_plus_bonus','commission_only')"],
    ["el descuento puede deshabilitarse", "mandatory_discount_enabled_snapshot"],
    ["el descuento persiste su tasa", "mandatory_discount_rate=case when"],
    ["el descuento toma produccion y no sueldo", "mandatory_discount_base_amount=case when coalesce(v_term.mandatory_discount_enabled,false) then v_recognized else 0 end"],
    ["la liquidacion guarda total reconocido", "recognized_production_total=v_recognized"],
    ["la liquidacion fija se prorratea por dias", "term.base_monthly_salary/2"],
    ["periodos cerrados no aceptan atribucion nueva", "if v_period.status in ('closed','cancelled') then return"],
    ["ventas anuladas revierten atribucion", "set status='reversed'"],
    ["el checkout mantiene el core previo", "checkout_pos_sale_v175"],
    ["la liquidacion conserva el core previo", "prepare_employee_settlement_v174"],
  ])("%s", async (_name, expectedSnippet) => {
    expect(await sql()).toContain(expectedSnippet);
  });
});
