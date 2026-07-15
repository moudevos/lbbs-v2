"use client";

import { useEffect, useState } from "react";
import Swal from "sweetalert2";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  closePosSession,
  fetchPosSessionCloseSummary,
  fetchPosSessionHistory,
} from "@/features/pos/pos-actions";
import { PosSessionCloseModal } from "@/features/pos/PosSessionCloseModal";
import type {
  PosBranchRecord,
  PosSessionCloseSummary,
  PosSessionHistoryRecord,
} from "@/features/pos/pos-types";
import { formatMoney } from "@/features/pos/pos-utils";

type Props = {
  branches: PosBranchRecord[];
  onSessionClosed: () => Promise<void>;
};

const statusLabels = {
  open: "Abierta",
  pending_close: "Pendiente de cierre",
  closed: "Cerrada",
  cancelled: "Cancelada",
};

function formatDateTime(value: string | null) {
  if (!value) return "Sin registro";
  return new Intl.DateTimeFormat("es-PE", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export function PosSessionHistory({ branches, onSessionClosed }: Props) {
  const [sessions, setSessions] = useState<PosSessionHistoryRecord[]>([]);
  const [branchId, setBranchId] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [summary, setSummary] = useState<PosSessionCloseSummary | null>(null);
  const [countedAmounts, setCountedAmounts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  async function loadHistory() {
    setIsLoading(true);
    try {
      setSessions(await fetchPosSessionHistory({ branchId, date, status }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo cargar el historial.";
      console.error("[pos/historial-ui] Error al cargar sesiones", { message });
      await Swal.fire({ icon: "error", title: "No se pudo cargar el historial", text: message, confirmButtonColor: "#0f766e" });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadHistory();
    }, 0);

    return () => window.clearTimeout(timer);
    // La recarga depende unicamente de los filtros visibles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, date, status]);

  async function openDetail(sessionId: string) {
    setIsLoadingDetail(true);
    setSummary(null);
    try {
      const detail = await fetchPosSessionCloseSummary(sessionId);
      setSummary(detail);
      setCountedAmounts(Object.fromEntries(detail.paymentMethods.map((method) => [method.paymentMethodId, detail.status === "closed" ? String(method.countedAmount ?? 0) : "0"])));
      setNotes(detail.closingNotes ?? "");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo cargar la sesion.";
      console.error("[pos/historial-ui] Error al cargar detalle", { message, sessionId });
      await Swal.fire({ icon: "error", title: "No se pudo cargar el detalle", text: message, confirmButtonColor: "#0f766e" });
    } finally {
      setIsLoadingDetail(false);
    }
  }

  async function handleCloseSession() {
    if (!summary) return;
    const confirmation = await Swal.fire({
      icon: "question",
      title: "Confirmar cierre de sesion",
      text: `Total neto: ${formatMoney(summary.netTotal)}. Se guardaran los montos reales y sus diferencias.`,
      showCancelButton: true,
      confirmButtonText: "Cerrar sesion",
      cancelButtonText: "Seguir revisando",
      confirmButtonColor: "#0f766e",
    });
    if (!confirmation.isConfirmed) return;

    setIsClosing(true);
    try {
      const result = await closePosSession(summary.sessionId, { counted_amounts: countedAmounts, notes });
      setSummary(result);
      await Promise.all([loadHistory(), onSessionClosed()]);
      await Swal.fire({ icon: "success", title: "Sesion cerrada", text: "El cierre quedo registrado por metodo.", confirmButtonColor: "#0f766e" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo cerrar la sesion.";
      console.error("[pos/historial-ui] Error al cerrar sesion", { message, sessionId: summary.sessionId });
      await Swal.fire({ icon: "error", title: "No se pudo cerrar la sesion", text: message, confirmButtonColor: "#0f766e" });
    } finally {
      setIsClosing(false);
    }
  }

  return (
    <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="text-base font-semibold text-slate-900">Historial de sesiones</p><p className="mt-1 text-sm text-slate-500">Aperturas, cierres y diferencias de caja.</p></div>
        <div className="grid gap-2 sm:grid-cols-3">
          <select className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm" value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">Todas las sedes</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          <select className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todos los estados</option><option value="open">Abierta</option><option value="pending_close">Pendiente de cierre</option><option value="closed">Cerrada</option><option value="cancelled">Cancelada</option></select>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-600"><tr><th className="px-3 py-3">Apertura</th><th className="px-3 py-3">Sede</th><th className="px-3 py-3">Abrió</th><th className="px-3 py-3">Cerró</th><th className="px-3 py-3">Estado</th><th className="px-3 py-3 text-right">Apertura</th><th className="px-3 py-3 text-right">Ventas</th><th className="px-3 py-3 text-right">Esperado</th><th className="px-3 py-3 text-right">Contado</th><th className="px-3 py-3 text-right">Diferencia</th><th className="px-3 py-3">Acciones</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? <tr><td colSpan={11} className="px-4 py-8 text-center text-slate-500">Cargando sesiones...</td></tr> : sessions.length === 0 ? <tr><td colSpan={11} className="px-4 py-8 text-center text-slate-500">No hay sesiones para estos filtros.</td></tr> : sessions.map((session) => (
              <tr key={session.id} className="text-slate-700"><td className="px-3 py-3">{formatDateTime(session.openedAt)}</td><td className="px-3 py-3 font-medium">{session.branchName}</td><td className="px-3 py-3">{session.openedByName ?? "Sin registro"}</td><td className="px-3 py-3">{session.closedByName ?? "-"}</td><td className="px-3 py-3"><span className={session.status === "pending_close" ? "font-semibold text-amber-700" : ""}>{statusLabels[session.status]}</span></td><td className="px-3 py-3 text-right">{formatMoney(session.openingCashAmount)}</td><td className="px-3 py-3 text-right">{formatMoney(session.totalSalesAmount)}</td><td className="px-3 py-3 text-right">{formatMoney(session.expectedCashAmount)}</td><td className="px-3 py-3 text-right">{session.countedCashAmount === null ? "-" : formatMoney(session.countedCashAmount)}</td><td className="px-3 py-3 text-right">{session.totalDifferenceAmount === null ? "-" : formatMoney(session.totalDifferenceAmount)}</td><td className="px-3 py-3"><Button type="button" className="h-8 px-3 text-xs" onClick={() => void openDetail(session.id)}>{session.status === "closed" ? "Ver detalle" : "Revisar cierre"}</Button></td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <PosSessionCloseModal open={isLoadingDetail || summary !== null} summary={summary} countedAmounts={countedAmounts} notes={notes} isLoading={isLoadingDetail} isSubmitting={isClosing} onCountedAmountChange={(methodId, value) => setCountedAmounts((current) => ({ ...current, [methodId]: value }))} onNotesChange={setNotes} onClose={() => { setSummary(null); setIsLoadingDetail(false); }} onSubmit={() => void handleCloseSession()} />
    </section>
  );
}
