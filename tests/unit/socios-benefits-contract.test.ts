import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "src/sql/154_socios_reusing_internal_benefits.sql");
const sql = readFileSync(root, "utf8");

describe("contrato de Socios y beneficios internos", () => {
  it("mantiene un perfil de socio por cliente y no duplica datos personales", () => {
    expect(sql).toContain("customer_id uuid not null unique references public.customers");
    expect(sql).not.toMatch(/\b(document_number|phone|email)\b[^\n]*\bin public\.socios/i);
  });

  it("impide usar socios inactivos o fuera de vigencia", () => {
    expect(sql).toContain("status='active'");
    expect(sql).toContain("starts_at<=public.pos_business_date()");
    expect(sql).toContain("ends_at is null or ends_at>=public.pos_business_date()");
  });

  it("reutiliza employee_benefit_rules mediante asignaciones, sin un segundo motor", () => {
    expect(sql).toContain("benefit_rule_id uuid not null references public.employee_benefit_rules");
    expect(sql).not.toContain("socio_benefit_rules");
  });

  it("distingue la operación de socio y conserva los importes auditables", () => {
    expect(sql).toContain("'socio_benefit'");
    expect(sql).toContain("fixed_barber_payout");
    expect(sql).toContain("operational_contribution");
  });

  it("valida límite por socio con ventas completadas, por lo que una cancelación libera uso", () => {
    expect(sql).toContain("o.socio_id=v_socio.id");
    expect(sql).toContain("s.status='completed'");
    expect(sql).toContain("v_used>=v_rule.usage_limit");
  });

  it("no genera deuda ni mezcla crédito de empleado para un socio", () => {
    expect(sql).toContain("La operación de socio no permite crédito interno.");
    expect(sql).toContain("'socio_benefit',v_subtotal,v_discount_total,0");
  });
});
