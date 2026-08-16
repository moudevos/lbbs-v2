import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requirePosWriteSession } from "@/lib/supabase/route-auth";

export async function GET(request: Request) {
  const auth = await requirePosWriteSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get("customerId")?.trim();
  const branchId = searchParams.get("branchId")?.trim();
  if (!customerId || !branchId) return NextResponse.json({ error: "Falta cliente o sede." }, { status: 400 });

  const supabase = await createClient();
  const { data: link, error: linkError } = await supabase
    .from("employee_customer_links")
    .select("employee_id,can_use_internal_credit,employee:employees!employee_customer_links_employee_id_fkey(id,full_name,role,status)")
    .eq("customer_id", customerId)
    .eq("is_active", true)
    .maybeSingle();
  if (linkError) return NextResponse.json({ error: "No se pudo validar el cliente interno." }, { status: 500 });
  if (!link) return NextResponse.json({ data: { employee: null, canUseCredit: false, rules: [] } });

  const employee = Array.isArray(link.employee) ? link.employee[0] : link.employee;
  if (!employee || employee.status !== "active") return NextResponse.json({ data: { employee: null, canUseCredit: false, rules: [] } });

  const businessDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
  const { data: rules, error: rulesError } = await supabase
    .from("employee_benefit_rules")
    .select("id,name,description,applies_to,service_id,product_id,benefit_type,benefit_value,usage_limit,period_kind,production_mode,fixed_barber_payout,operational_contribution,requires_owner_authorization,is_internal_complimentary")
    .eq("is_active", true)
    .lte("effective_from", businessDate)
    .or(`effective_to.is.null,effective_to.gte.${businessDate}`)
    .or(`branch_id.is.null,branch_id.eq.${branchId}`)
    .or(`eligible_role.is.null,eligible_role.eq.${employee.role}`)
    .order("name");
  if (rulesError) return NextResponse.json({ error: "No se pudieron cargar los beneficios internos." }, { status: 500 });

  return NextResponse.json({
    data: {
      employee: { id: employee.id, fullName: employee.full_name, role: employee.role },
      canUseCredit: Boolean(link.can_use_internal_credit),
      rules: rules ?? [],
    },
  });
}
