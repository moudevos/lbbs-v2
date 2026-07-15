import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireReservationWriteSession } from "@/lib/supabase/route-auth";
import { renderWhatsAppTemplate } from "@/lib/whatsapp/template";

function relation<T>(value:T|T[]|null){return Array.isArray(value)?value[0]??null:value;}
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  const auth=await requireReservationWriteSession();if(!auth.ok)return NextResponse.json({error:auth.message},{status:auth.status});const {id}=await params;const supabase=await createClient();
  const [reservationResult,templateResult]=await Promise.all([supabase.from("reservations").select("id,customer_id,branch_id,scheduled_date,scheduled_time,customer:customers(full_name,phone),branch:branches(name,address,phone),barber:employees!reservations_preferred_barber_id_fkey(full_name),service:services(name)").eq("id",id).maybeSingle(),supabase.from("whatsapp_templates").select("id,body").eq("contact_type","reservation_reminder").eq("is_active",true).order("updated_at",{ascending:false}).limit(1).maybeSingle()]);
  const error=reservationResult.error??templateResult.error;if(error||!reservationResult.data||!templateResult.data){console.error("[reservations/contact] Error",{message:error?.message,code:error?.code,details:error?.details,hint:error?.hint,entityId:id});return NextResponse.json({error:"No se pudo preparar el contacto."},{status:500});}
  const row=reservationResult.data;const customer=relation(row.customer);const branch=relation(row.branch);if(!customer?.phone)return NextResponse.json({error:"El cliente no tiene celular registrado."},{status:400});const message=renderWhatsAppTemplate(templateResult.data.body,{cliente:customer.full_name,fecha:row.scheduled_date??"",hora:row.scheduled_time?.slice(0,5)??"",sede:branch?.name??"",direccion:branch?.address??"",telefono_sede:branch?.phone??"",barbero:relation(row.barber)?.full_name??"Cualquier barbero disponible",servicio:relation(row.service)?.name??"No especificado"});return NextResponse.json({data:{customerId:row.customer_id,branchId:row.branch_id,templateId:templateResult.data.id,phone:customer.phone,message}});
}
