import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePosWriteSession } from "@/lib/supabase/route-auth";

export async function POST(_request:Request,{params}:{params:Promise<{reservationId:string}>}){
  const auth=await requirePosWriteSession();if(!auth.ok)return NextResponse.json({error:auth.message},{status:auth.status});const {reservationId}=await params;const supabase=await createClient();const {data:employeeId}=await supabase.rpc("current_employee_id");
  const {data,error}=await supabase.from("reservations").update({status:"checked_in",updated_by:employeeId??null}).eq("id",reservationId).eq("status","confirmed").select("id,status").maybeSingle();
  if(error){console.error("[pos/reservations/check-in] Error",{message:error.message,code:error.code,details:error.details,hint:error.hint,entityId:reservationId});return NextResponse.json({error:"No se pudo marcar la reserva en tienda."},{status:500});}
  if(!data)return NextResponse.json({error:"La reserva ya no puede marcarse en tienda."},{status:409});return NextResponse.json({data});
}
