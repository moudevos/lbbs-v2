"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PosCustomerRecord } from "@/features/pos/pos-types";

export type PosReservationRow = { id:string; status:"scheduled"|"pending"|"contacted"|"confirmed"|"rescheduled"|"checked_in"; scheduledDate:string; time:string; customer:PosCustomerRecord|null; branchId:string; barberId:string|null; barberName:string|null; serviceId:string|null; serviceName:string|null; source:string; linkedSale:{id:string;status:string}|null };

const sourceLabels: Record<string, string> = { public_form: "Web", manual: "Recepcion", phone: "Telefono", whatsapp: "WhatsApp" };

export function PosReservationsModal({ open, sessionId, businessDate, onClose, onUse }:{open:boolean;sessionId:string;businessDate:string;onClose:()=>void;onUse:(row:PosReservationRow)=>void}) {
  const [search,setSearch]=useState(""); const [date,setDate]=useState(businessDate);
  useEffect(() => { if (!open) return; const timer = window.setTimeout(() => { setDate(businessDate); setSearch(""); }, 0); return () => window.clearTimeout(timer); }, [open, businessDate, sessionId]);
  const query=useQuery({queryKey:["pos","eligible-reservations",sessionId,date,search],enabled:open&&Boolean(sessionId)&&Boolean(date),queryFn:async()=>{const params=new URLSearchParams({sessionId,date,search});const response=await fetch(`/api/admin/pos/reservations?${params}`);const payload=await response.json();if(!response.ok)throw new Error(payload.error);return payload.data as PosReservationRow[];}});
  return <Modal open={open} title="Reservas" onClose={onClose} confirmBeforeClose={false} size="lg" footer={<Button type="button" className="bg-slate-100 text-slate-700 hover:bg-slate-200" onClick={onClose}>Cerrar</Button>}><div className="space-y-3"><div className="grid gap-2 sm:grid-cols-2"><Input type="date" value={date} onChange={(event)=>setDate(event.target.value)} /><Input value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Buscar cliente, celular o documento" /></div>{query.isLoading?<p className="text-sm text-slate-500">Cargando reservas...</p>:query.isError?<p className="text-sm text-rose-700">No se pudieron cargar las reservas. Intenta nuevamente.</p>:<div className="divide-y divide-slate-100">{(query.data??[]).map((row)=><div key={row.id} className="flex items-center justify-between gap-3 py-3"><div><p className="text-sm font-semibold text-slate-900">{row.time} - {row.customer?.full_name??"Cliente"}</p><p className="text-xs text-slate-600">{row.customer?.phone??"Sin celular"} - {row.serviceName??"Servicio no especificado"}</p><p className="text-xs text-slate-500">Barbero: {row.barberName??"Cualquier barbero disponible"} · Programada · {sourceLabels[row.source] ?? row.source}</p>{row.linkedSale?.status==="draft"?<p className="text-xs font-medium text-amber-700">Venta en proceso</p>:null}</div><Button type="button" disabled={row.linkedSale?.status==="draft"} onClick={()=>onUse(row)}>{row.linkedSale?.status==="draft"?"Venta en proceso":"Usar en venta"}</Button></div>)}{!query.data?.length?<p className="py-8 text-center text-sm text-slate-500">No hay reservas programadas para esta sede y fecha.</p>:null}</div>}</div></Modal>;
}
