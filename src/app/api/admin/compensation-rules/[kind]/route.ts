import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/supabase/route-auth";

const tables = {
  operational: "production_operational_rules",
  reward: "reward_service_commission_rules",
  courtesy: "courtesy_service_commission_rules",
  product_bonus: "product_bonus_rules",
  supply_markup: "employee_supply_markup_rules",
} as const;

type RuleKind = keyof typeof tables;
const isKind = (value: string): value is RuleKind => value in tables;

function buildValues(kind: RuleKind, payload: Record<string, unknown>, employeeId: string | null) {
  const base = { name: String(payload.name ?? "").trim(), priority: Number(payload.priority ?? 0), is_active: payload.is_active !== false, effective_from: payload.effective_from || new Date().toISOString().slice(0,10), effective_to: payload.effective_to || null, created_by: employeeId };
  if (kind === "operational") return { ...base, minimum_amount: Number(payload.minimum_amount ?? 0), maximum_amount: payload.maximum_amount === "" || payload.maximum_amount == null ? null : Number(payload.maximum_amount), calculation_type: payload.calculation_type, calculation_value: Number(payload.value) };
  if (kind === "reward" || kind === "courtesy") return { ...base, service_id: payload.scope_type === "service" ? payload.scope_id || null : null, service_category_id: payload.scope_type === "category" ? payload.scope_id || null : null, fixed_commission_amount: Number(payload.value) };
  if (kind === "product_bonus") return {
    ...base,
    product_id: payload.scope_type === "product" ? payload.scope_id || null : null,
    product_category_id: payload.scope_type === "product_category" ? payload.scope_id || null : null,
    service_id: payload.scope_type === "service" ? payload.scope_id || null : null,
    service_category_id: payload.scope_type === "service_category" ? payload.scope_id || null : null,
    bonus_type: "fixed_per_unit",
    bonus_value: Number(payload.value),
  };
  return { ...base, product_id: payload.scope_type === "product" ? payload.scope_id || null : null, markup_type: payload.calculation_type, markup_value: Number(payload.value) };
}

export async function GET(_request: Request, context: { params: Promise<{ kind: string }> }) {
  const auth = await requireAdminSession(); if (!auth.ok) return NextResponse.json({error:auth.message},{status:auth.status});
  const {kind:rawKind}=await context.params; if(!isKind(rawKind))return NextResponse.json({error:"Tipo de regla no valido."},{status:404});
  const supabase=await createClient();
  const [rules,services,serviceCategories,products,productCategories]=await Promise.all([
    supabase.from(tables[rawKind]).select("*").order("priority",{ascending:false}),
    supabase.from("services").select("id,name").eq("is_active",true).order("name"),
    supabase.from("service_categories").select("id,name").eq("is_active",true).order("name"),
    supabase.from("products").select("id,name").eq("is_active",true).order("name"),
    supabase.from("product_categories").select("id,name").eq("is_active",true).order("name"),
  ]);
  const error=rules.error??services.error??serviceCategories.error??products.error??productCategories.error;if(error){console.error("[compensation-rules/get] Error",{kind:rawKind,message:error.message,code:error.code});return NextResponse.json({error:"No se pudieron cargar las reglas."},{status:500});}
  return NextResponse.json({data:rules.data??[],options:{services:services.data??[],serviceCategories:serviceCategories.data??[],products:products.data??[],productCategories:productCategories.data??[]}});
}

export async function POST(request:Request,context:{params:Promise<{kind:string}>}){
  const auth=await requireAdminSession();if(!auth.ok)return NextResponse.json({error:auth.message},{status:auth.status});const {kind:rawKind}=await context.params;if(!isKind(rawKind))return NextResponse.json({error:"Tipo de regla no valido."},{status:404});
  const payload=await request.json().catch(()=>null);if(!payload?.name)return NextResponse.json({error:"El nombre es obligatorio."},{status:400});if(rawKind==="product_bonus"&&(!payload.scope_id||!["product","product_category","service","service_category"].includes(String(payload.scope_type))))return NextResponse.json({error:"Selecciona el producto, servicio o categoria al que aplica el bono."},{status:400});const supabase=await createClient();const {data:employeeId}=await supabase.rpc("current_employee_id");const values=buildValues(rawKind,payload,employeeId??null);if(payload.id)delete (values as Partial<typeof values>).created_by;
  const result=payload.id?await supabase.from(tables[rawKind]).update(values as never).eq("id",payload.id).select().single():await supabase.from(tables[rawKind]).insert(values as never).select().single();if(result.error){console.error("[compensation-rules/post] Error",{kind:rawKind,message:result.error.message,code:result.error.code});return NextResponse.json({error:"No se pudo guardar la regla. Revisa alcance, valores y vigencia."},{status:400});}return NextResponse.json({data:result.data});
}

export async function PATCH(request:Request,context:{params:Promise<{kind:string}>}){
  const auth=await requireAdminSession();if(!auth.ok)return NextResponse.json({error:auth.message},{status:auth.status});const {kind:rawKind}=await context.params;if(!isKind(rawKind))return NextResponse.json({error:"Tipo de regla no valido."},{status:404});const payload=await request.json().catch(()=>null);if(!payload?.id||typeof payload.is_active!=="boolean")return NextResponse.json({error:"Datos incompletos."},{status:400});const supabase=await createClient();const {data,error}=await supabase.from(tables[rawKind]).update({is_active:payload.is_active,updated_at:new Date().toISOString()}).eq("id",payload.id).select().single();if(error)return NextResponse.json({error:"No se pudo cambiar el estado."},{status:400});return NextResponse.json({data});
}
