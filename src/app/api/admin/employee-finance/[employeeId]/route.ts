import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminSession, requirePosWriteSession } from "@/lib/supabase/route-auth";

export async function GET(_request:Request,context:{params:Promise<{employeeId:string}>}){
  const auth=await requireAdminSession();if(!auth.ok)return NextResponse.json({error:auth.message},{status:auth.status});const{employeeId}=await context.params;const supabase=await createClient();
  const [employee,benefits,debts,movements,supplies,production,settlements,services,products,providers,methods]=await Promise.all([
    supabase.from("employees").select("id,full_name,document_number,position,branch_id,status,branch:branches(name)").eq("id",employeeId).single(),
    supabase.from("employee_benefit_usages").select("*,service:services(name),provider:employees!employee_benefit_usages_provider_employee_id_fkey(full_name)").eq("employee_id",employeeId).order("benefit_month",{ascending:false}),
    supabase.from("employee_debts").select("*").eq("employee_id",employeeId).order("created_at",{ascending:false}),
    supabase.from("employee_debt_movements").select("*,debt:employee_debts!inner(employee_id)").eq("debt.employee_id",employeeId).order("created_at",{ascending:false}),
    supabase.from("employee_supply_deliveries").select("*,product:products(name)").eq("employee_id",employeeId).order("created_at",{ascending:false}),
    supabase.from("employee_service_production").select("*,service:services(name)").eq("employee_id",employeeId).order("production_date",{ascending:false}).limit(100),
    supabase.from("employee_settlements").select("*,period:payroll_periods(start_date,end_date)").eq("employee_id",employeeId).order("created_at",{ascending:false}),
    supabase.from("services").select("id,name").eq("is_active",true).order("name"),
    supabase.from("products").select("id,name,cost_price").eq("is_active",true).order("name"),
    supabase.from("employees").select("id,full_name").eq("status","active").order("full_name"),
    supabase.from("payment_methods").select("id,code,name").eq("is_active",true).order("sort_order"),
  ]);const error=employee.error??benefits.error??debts.error??movements.error??supplies.error??production.error??settlements.error??services.error??products.error??providers.error??methods.error;if(error){console.error("[employee-finance/get] Error",{employeeId,message:error.message,code:error.code});return NextResponse.json({error:"No se pudo cargar el perfil financiero."},{status:500});}
  return NextResponse.json({employee:employee.data,benefits:benefits.data??[],debts:debts.data??[],movements:movements.data??[],supplies:supplies.data??[],production:production.data??[],settlements:settlements.data??[],options:{services:services.data??[],products:products.data??[],providers:providers.data??[],paymentMethods:methods.data??[]}});
}

export async function POST(request:Request,context:{params:Promise<{employeeId:string}>}){
  const auth=await requirePosWriteSession();if(!auth.ok)return NextResponse.json({error:auth.message},{status:auth.status});const{employeeId}=await context.params;const payload=await request.json().catch(()=>null);const supabase=await createClient();let result;
  if(payload?.action==="create_debt"){if(auth.role!=="owner"&&auth.role!=="admin")return NextResponse.json({error:"No tienes permiso para registrar deudas."},{status:403});result=await supabase.rpc("create_employee_debt",{p_employee_id:employeeId,p_branch_id:payload.branchId,p_debt_type:payload.debtType,p_amount:Number(payload.amount),p_description:payload.description});}
  else if(payload?.action==="pay_debt"){if(auth.role!=="owner"&&auth.role!=="admin")return NextResponse.json({error:"No tienes permiso para registrar pagos."},{status:403});result=await supabase.rpc("apply_employee_debt_payment",{p_debt_id:payload.debtId,p_amount:Number(payload.amount),p_movement_type:"manual_payment",p_notes:payload.notes||null,p_payment_method_id:payload.paymentMethodId||null,p_payment_reference:payload.reference||null});}
  else if(payload?.action==="benefit"){result=await supabase.rpc("register_employee_benefit_usage",{p_employee_id:employeeId,p_branch_id:payload.branchId,p_service_id:payload.serviceId||null,p_provider_employee_id:payload.providerEmployeeId||null,p_notes:payload.notes||null});}
  else if(payload?.action==="supply"){result=await supabase.rpc("register_employee_supply_delivery",{p_employee_id:employeeId,p_branch_id:payload.branchId,p_product_id:payload.productId,p_quantity:Number(payload.quantity),p_payment_mode:payload.paymentMode,p_payment_method_id:payload.paymentMethodId||null,p_payment_reference:payload.reference||null,p_notes:payload.notes||null});}
  else return NextResponse.json({error:"Accion no valida."},{status:400});
  if(result.error){console.error("[employee-finance/post] Error",{employeeId,action:payload.action,message:result.error.message,code:result.error.code});const message=result.error.message.includes("sesion POS")?"No existe una sesion POS activa para registrar el ingreso inmediato.":result.error.message.includes("corte gratuito")?"El empleado ya utilizo su corte gratuito de este mes.":"No se pudo registrar la operacion.";return NextResponse.json({error:message},{status:400});}return NextResponse.json({data:result.data});
}

