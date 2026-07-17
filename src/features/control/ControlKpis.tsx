"use client";

import { useEffect, useState } from "react";

type Payload = {
  financial: boolean;
  metrics: Record<string, number | null>;
  sessions: Array<{ id: string; branchName: string; status: string }>;
};

type ControlKpisProps = {
  greetingName: string;
  verse: { text: string; label: string };
};

const money = (value: number | null) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(value ?? 0);

export function ControlKpis({ greetingName, verse }: ControlKpisProps) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { void (async () => { try { const response = await fetch("/api/admin/control/kpis", { cache: "no-store" }); const result = await response.json(); if (!response.ok) throw new Error(); setPayload(result); } catch { console.error("[control/ui] Error al cargar KPIs operativos"); setError(true); } })(); }, []);
  if (error) return <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">No se pudieron cargar los indicadores operativos.</section>;
  if (!payload) return <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">Cargando indicadores operativos...</section>;
  const m = payload.metrics;
  const cards = payload.financial ? [["Ventas netas de hoy", money(m.netSales)], ["Ventas completadas", String(m.completedSales ?? 0)], ["Ventas anuladas", String(m.cancelledSales ?? 0)], ["Ticket promedio", money(m.averageTicket)], ["Efectivo cobrado", money(m.cash)], ["QR cobrado", money(m.wallet)], ["Tarjeta cobrada", money(m.card)], ["Descuentos aplicados", money(m.discounts)], ["Cortesias", money(m.courtesies)], ["Servicios realizados", String(m.services ?? 0)], ["Productos vendidos", String(m.products ?? 0)]] : [["Ventas completadas", String(m.completedSales ?? 0)], ["Ventas anuladas", String(m.cancelledSales ?? 0)], ["Servicios realizados", String(m.services ?? 0)], ["Productos vendidos", String(m.products ?? 0)]];
  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-sky-100 bg-[linear-gradient(135deg,#ffffff_0%,#f0f9ff_58%,#ecfdf5_100%)] p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-900">Bienvenido, {greetingName}</p>
        <p className="mt-1 text-sm italic text-slate-600">&ldquo;{verse.text}&rdquo;</p>
        <p className="mt-1 text-xs font-medium text-emerald-700">{verse.label} · #CRISTOVIVE</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <article key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-900">Sesiones POS por sede</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {payload.sessions.length ? (
            payload.sessions.map((session) => (
              <span key={session.id} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                {session.branchName}: abierta
              </span>
            ))
          ) : (
            <p className="text-sm text-slate-500">No hay sesiones POS abiertas.</p>
          )}
        </div>
      </section>
    </div>
  );
}
