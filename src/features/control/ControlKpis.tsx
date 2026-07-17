"use client";

import { useEffect, useMemo, useState } from "react";

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

const number = (value: number | null) => new Intl.NumberFormat("es-PE").format(value ?? 0);

function HeroStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tracking-tight ${accent ?? "text-slate-900"}`}>{value}</p>
    </article>
  );
}

function CompareBar({
  title,
  left,
  right,
}: {
  title: string;
  left: { label: string; value: number; color: string };
  right: { label: string; value: number; color: string };
}) {
  const total = left.value + right.value;
  const leftPct = total > 0 ? (left.value / total) * 100 : 50;
  const rightPct = 100 - leftPct;

  return (
    <div>
      <p className="text-xs font-medium text-slate-500">{title}</p>
      <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div style={{ width: `${leftPct}%`, backgroundColor: left.color }} />
        <div style={{ width: `${rightPct}%`, backgroundColor: right.color }} />
      </div>
      <div className="mt-2 flex justify-between text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: left.color }} />
          {left.label}: <strong className="font-semibold text-slate-900">{number(left.value)}</strong>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: right.color }} />
          {right.label}: <strong className="font-semibold text-slate-900">{number(right.value)}</strong>
        </span>
      </div>
    </div>
  );
}

function PaymentDonut({ segments }: { segments: Array<{ label: string; value: number; color: string }> }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  const gradient = useMemo(() => {
    if (total <= 0) return "#e2e8f0";
    let acc = 0;
    const stops = segments.map((s) => {
      const start = acc;
      acc += (s.value / total) * 100;
      return `${s.color} ${start}% ${acc}%`;
    });
    return `conic-gradient(${stops.join(", ")})`;
  }, [segments, total]);

  return (
    <div className="flex items-center gap-5">
      <div
        className="relative h-28 w-28 shrink-0 rounded-full"
        style={{ background: gradient }}
        role="img"
        aria-label="Distribución de métodos de pago"
      >
        <div className="absolute inset-2.5 flex flex-col items-center justify-center rounded-full bg-white text-center">
          <span className="text-[10px] text-slate-500">Cobrado</span>
          <span className="text-sm font-semibold text-slate-900">{money(total)}</span>
        </div>
      </div>
      <ul className="flex-1 space-y-2">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-slate-600">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
            </span>
            <span className="font-medium text-slate-900">{money(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ControlKpis({ greetingName, verse }: ControlKpisProps) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/admin/control/kpis", { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error();
        setPayload(result);
      } catch {
        console.error("[control/ui] Error al cargar KPIs operativos");
        setError(true);
      }
    })();
  }, []);

  if (error) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
        No se pudieron cargar los indicadores operativos.
      </section>
    );
  }

  if (!payload) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
        Cargando indicadores operativos...
      </section>
    );
  }

  const m = payload.metrics;

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-sky-100 bg-[linear-gradient(135deg,#ffffff_0%,#f0f9ff_58%,#ecfdf5_100%)] p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-900">Bienvenido, {greetingName}</p>
        <p className="mt-1 text-sm italic text-slate-600">&ldquo;{verse.text}&rdquo;</p>
        <p className="mt-1 text-xs font-medium text-emerald-700">{verse.label} · #CRISTOVIVE</p>
      </section>

      {/* Cifras clave */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {payload.financial ? (
          <>
            <HeroStat label="Ventas netas de hoy" value={money(m.netSales)} accent="text-emerald-700" />
            <HeroStat label="Ticket promedio" value={money(m.averageTicket)} />
            <HeroStat label="Ventas completadas" value={number(m.completedSales)} />
            <HeroStat label="Ventas anuladas" value={number(m.cancelledSales)} accent="text-amber-700" />
          </>
        ) : (
          <>
            <HeroStat label="Ventas completadas" value={number(m.completedSales)} accent="text-emerald-700" />
            <HeroStat label="Ventas anuladas" value={number(m.cancelledSales)} accent="text-amber-700" />
            <HeroStat label="Servicios realizados" value={number(m.services)} />
            <HeroStat label="Productos vendidos" value={number(m.products)} />
          </>
        )}
      </section>

      {payload.financial && (
        <section className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-900">Métodos de pago</p>
            <div className="mt-4">
              <PaymentDonut
                segments={[
                  { label: "Efectivo", value: m.cash ?? 0, color: "#0ea5e9" },
                  { label: "QR", value: m.wallet ?? 0, color: "#10b981" },
                  { label: "Tarjeta", value: m.card ?? 0, color: "#f59e0b" },
                ]}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-900">Descuentos y cortesías</p>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span className="text-sm text-slate-600">Descuentos aplicados</span>
                <span className="text-sm font-semibold text-slate-900">{money(m.discounts)}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span className="text-sm text-slate-600">Cortesías</span>
                <span className="text-sm font-semibold text-slate-900">{money(m.courtesies)}</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Operación */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <CompareBar
            title="Ventas: completadas vs. anuladas"
            left={{ label: "Completadas", value: m.completedSales ?? 0, color: "#10b981" }}
            right={{ label: "Anuladas", value: m.cancelledSales ?? 0, color: "#f59e0b" }}
          />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <CompareBar
            title="Servicios vs. productos"
            left={{ label: "Servicios", value: m.services ?? 0, color: "#0ea5e9" }}
            right={{ label: "Productos", value: m.products ?? 0, color: "#6366f1" }}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-900">Sesiones POS por sede</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {payload.sessions.length ? (
            payload.sessions.map((session) => (
              <span
                key={session.id}
                className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
              >
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