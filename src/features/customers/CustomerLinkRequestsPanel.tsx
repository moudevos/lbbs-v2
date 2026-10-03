"use client";

import { useCallback, useEffect, useState } from "react";
import Swal from "sweetalert2";

import { Button } from "@/components/ui/button";

type RequestRow = {
  id: string;
  status: string;
  requested_document_type: string | null;
  requested_document_number: string;
  requested_phone: string;
  requested_email: string | null;
  requested_name: string;
  requested_at: string;
  code_expires_at: string | null;
  customers: { full_name: string; document_type: string | null; document_number: string | null; phone: string; email: string | null } | null;
};

type Filter = "pending" | "active" | "finished" | "all";
const labels: Record<Filter, string> = { pending: "Por revisar", active: "Código vigente", finished: "Finalizadas", all: "Todas" };

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" }) : "—";
}

async function showGeneratedCode(code: string, expiresAt?: string | null) {
  await Swal.fire({
    icon: "success",
    title: "Código generado",
    html: `<p>Comunícalo al cliente. Sólo es válido temporalmente.</p><strong style="font-size:2rem;letter-spacing:.25em">${code}</strong><p><small>Expira: ${formatDate(expiresAt ?? null)}</small></p>`,
    showDenyButton: true,
    confirmButtonText: "Listo",
    denyButtonText: "Copiar código",
    preDeny: async () => {
      try {
        await navigator.clipboard.writeText(code);
        await Swal.fire({ icon: "success", title: "Código copiado", timer: 1_200, showConfirmButton: false });
      } catch {
        await Swal.fire({ icon: "error", title: "No se pudo copiar", text: "Cópialo manualmente antes de cerrar esta ventana." });
      }
      return false;
    },
  });
}

export function CustomerLinkRequestsPanel() {
  const [filter, setFilter] = useState<Filter>("pending");
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (selectedFilter: Filter) => {
    const response = await fetch(`/api/admin/customer-link-requests?filter=${selectedFilter}`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "No se pudieron cargar vinculaciones.");
    setRows(result.data);
  }, []);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      void load(filter)
        .catch(async (error: Error) => { if (active) await Swal.fire({ icon: "error", title: "No se pudieron cargar vinculaciones", text: error.message }); })
        .finally(() => { if (active) setLoading(false); });
    }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [filter, load]);

  async function action(row: RequestRow, actionName: "approve" | "reject") {
    const regenerating = actionName === "approve" && row.status === "code_generated";
    const confirmed = await Swal.fire({
      icon: "question",
      title: actionName === "approve" ? regenerating ? "Regenerar código" : "Generar código" : "Rechazar solicitud",
      text: regenerating ? "El código anterior quedará invalidado inmediatamente." : actionName === "approve" ? "Se mostrará un código de un solo uso y vigencia limitada." : "La solicitud no podrá usar este vínculo.",
      showCancelButton: true,
      confirmButtonText: actionName === "approve" ? regenerating ? "Regenerar" : "Generar" : "Rechazar",
    });
    if (!confirmed.isConfirmed) return;
    const response = await fetch(`/api/admin/customer-link-requests/${row.id}/${actionName}`, { method: "POST" });
    const result = await response.json();
    if (!response.ok) { await Swal.fire({ icon: "error", title: "No se pudo completar la acción", text: result.error || "Inténtalo nuevamente." }); return; }
    if (actionName === "approve") await showGeneratedCode(result.data.code, result.data.expiresAt);
    await load(filter);
  }

  return <div className="space-y-4"><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm font-semibold text-slate-900">Solicitudes de vinculación</p><p className="mt-1 text-sm text-slate-600">Verifica que la ficha existente corresponda al cliente antes de generar el código.</p><div className="mt-4 flex flex-wrap gap-2">{(Object.keys(labels) as Filter[]).map((item) => <Button key={item} type="button" className={filter === item ? "h-8 px-3" : "h-8 bg-slate-100 px-3 text-slate-700 hover:bg-slate-200"} onClick={() => setFilter(item)}>{labels[item]}</Button>)}</div></section><section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">{loading ? <p className="text-sm text-slate-600">Cargando solicitudes...</p> : <table className="min-w-full text-sm"><thead className="text-left text-xs uppercase text-slate-500"><tr><th className="p-2">Cliente</th><th className="p-2">Documento / teléfono</th><th className="p-2">Correo Google</th><th className="p-2">Estado</th><th className="p-2">Solicitud / vencimiento</th><th className="p-2 text-right">Acciones</th></tr></thead><tbody>{rows.map((row) => <tr className="border-t border-slate-100" key={row.id}><td className="p-2"><strong>{row.customers?.full_name ?? row.requested_name}</strong><br/><span className="text-slate-500">Ficha: {row.customers?.full_name ?? "No encontrada"}</span></td><td className="p-2">{row.requested_document_type ?? "Doc."} {row.requested_document_number}<br/><span className="text-slate-500">{row.requested_phone}</span></td><td className="p-2">{row.requested_email ?? row.customers?.email ?? "—"}</td><td className="p-2"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{row.status}</span></td><td className="p-2">{formatDate(row.requested_at)}{row.code_expires_at ? <><br/><span className="text-slate-500">Vence: {formatDate(row.code_expires_at)}</span></> : null}</td><td className="p-2"><div className="flex justify-end gap-2">{["pending", "approved", "code_generated"].includes(row.status) ? <Button type="button" className="h-8 px-3" onClick={() => void action(row, "approve")}>{row.status === "code_generated" ? "Regenerar código" : "Generar código"}</Button> : null}{["pending", "approved"].includes(row.status) ? <Button type="button" className="h-8 bg-rose-100 px-3 text-rose-700 hover:bg-rose-200" onClick={() => void action(row, "reject")}>Rechazar</Button> : null}</div></td></tr>)}{rows.length === 0 ? <tr><td className="p-8 text-center text-slate-500" colSpan={6}>No hay solicitudes en este filtro.</td></tr> : null}</tbody></table>}</section></div>;
}
