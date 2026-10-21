"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  faArrowRotateRight,
  faBoxOpen,
  faCalendarDays,
  faCashRegister,
  faChartLine,
  faChevronRight,
  faClock,
  faMoon,
  faScissors,
  faSun,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

type BranchToday = {
  id: string;
  name: string;
  sales: number;
  collected: number;
  services: number;
  sessionStatus: string;
};

type DashboardData = {
  role: "owner" | "admin" | "reception" | "barber" | "viewer";
  financial: boolean;
  metrics: {
    netSales: number | null;
    completedSales: number;
    services: number;
    cancelledSales: number;
  };
  todaySummary: {
    collectedToday: number | null;
    unpaidTotal: number | null;
    unpaidSales: number | null;
    pendingReservations: number;
    pendingPosClosures: number;
    lastWeekDate: string;
    comparisonAvailable: boolean;
    salesPreviousWeekSameHour: number | null;
    salesTodaySameHour: number | null;
    updatedAt: string;
    branches: BranchToday[];
  };
  criticalStock: Array<{ name: string; branchName: string; quantity: number }>;
  topServices: Array<{ name: string; quantity: number }>;
  topProducts: Array<{ name: string; quantity: number }>;
  salesByHour: Array<{ hour: number; sales: number; revenue: number }>;
  sessions: Array<{ id: string; branchName: string; status: string }>;
  range: { dateFrom: string; dateTo: string };
};

type Alert = {
  id: string;
  title: string;
  detail: string;
  href: string;
  tone: "rose" | "amber" | "sky";
};

const currency = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });
const integer = new Intl.NumberFormat("es-PE");
const limaDate = (value: string) =>
  new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
const limaTime = (value: string) =>
  new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" }).format(new Date(value));

function MetricCard({
  title, value, hint, icon, emphasized = false, detail,
}: {
  title: string; value: string; hint: string; icon: IconDefinition; emphasized?: boolean; detail?: ReactNode;
}) {
  return (
    <article className={`min-w-0 rounded-2xl border p-4 shadow-sm sm:p-5 ${emphasized ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200 bg-white"}`}>
      <div className="flex items-center gap-2.5 text-sm font-semibold text-slate-700">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${emphasized ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}>
          <FontAwesomeIcon icon={icon} className="h-4 w-4" />
        </span>
        <span>{title}</span>
      </div>
      <p className={`mt-4 break-words text-2xl font-bold tracking-tight sm:text-[1.75rem] ${emphasized ? "text-emerald-800" : "text-slate-950"}`}>{value}</p>
      <p className="mt-1.5 text-xs leading-5 text-slate-500">{hint}</p>
      {detail ? <div className="mt-3 border-t border-slate-200/70 pt-3 text-xs">{detail}</div> : null}
    </article>
  );
}

function SectionTitle({ title, description, href, linkLabel }: { title: string; description: string; href?: string; linkLabel?: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-bold text-slate-950 sm:text-lg">{title}</h2>
        <p className="mt-0.5 text-sm text-slate-500">{description}</p>
      </div>
      {href ? <Link href={href} className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:underline">
        {linkLabel ?? "Ver detalle"} <FontAwesomeIcon icon={faChevronRight} className="h-3 w-3" />
      </Link> : null}
    </div>
  );
}

function RankList({ title, icon, rows }: { title: string; icon: IconDefinition; rows: Array<{ name: string; quantity: number }> }) {
  const max = Math.max(1, ...rows.map((row) => row.quantity));
  return (
    <section className="min-w-0">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><FontAwesomeIcon icon={icon} className="h-4 w-4 text-emerald-600" />{title}</h3>
      <div className="mt-3 space-y-3">
        {rows.length ? rows.map((row, index) => (
          <div key={`${title}-${row.name}`}>
            <div className="mb-1 flex items-start justify-between gap-3 text-xs">
              <span className="min-w-0 break-words text-slate-700"><span className="mr-1.5 font-bold text-slate-400">{index + 1}.</span>{row.name}</span>
              <span className="shrink-0 font-bold text-slate-900">{integer.format(row.quantity)} uds.</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(3, row.quantity / max * 100)}%` }} /></div>
          </div>
        )) : <p className="text-sm text-slate-500">Todavía no hay ventas registradas.</p>}
      </div>
    </section>
  );
}

function HourlyChart({ rows, updatedAt }: { rows: DashboardData["salesByHour"]; updatedAt: string }) {
  const currentHour = Number(new Intl.DateTimeFormat("en-US", { hour: "2-digit", hourCycle: "h23", timeZone: "America/Lima" }).format(new Date(updatedAt)));
  const sorted = [...rows].sort((a, b) => a.hour - b.hour);
  const max = Math.max(1, ...sorted.map((hour) => hour.revenue));
  const peak = sorted.reduce<{ hour: number; revenue: number } | null>((best, hour) =>
    hour.revenue > (best?.revenue ?? 0) ? { hour: hour.hour, revenue: hour.revenue } : best, null);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <SectionTitle title="Facturación por hora" description="Ventas completadas agrupadas por hora de registro (Lima)." />
      <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
        <span className="rounded-lg bg-slate-100 px-2.5 py-1.5">Operaciones: {integer.format(sorted.reduce((sum, row) => sum + row.sales, 0))}</span>
        <span className="rounded-lg bg-slate-100 px-2.5 py-1.5">Hora pico: {peak ? `${String(peak.hour).padStart(2, "0")}:00` : "Sin ventas"}</span>
      </div>
      <div className="mt-5 overflow-x-auto pb-2" role="img" aria-label="Gráfico de facturación por las 24 horas del día">
        <div className="flex h-44 min-w-[670px] items-end gap-1.5 border-b border-slate-200 pb-0.5">
          {sorted.map((row) => (
            <div key={row.hour} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end" title={`${String(row.hour).padStart(2, "0")}:00 · ${currency.format(row.revenue)} · ${row.sales} ventas`}>
              <span className="mb-1 text-[9px] font-medium text-slate-500 opacity-0 group-hover:opacity-100">{row.sales || ""}</span>
              <div className={`w-full max-w-6 rounded-t-md transition-colors ${row.hour === currentHour ? "bg-emerald-600" : "bg-sky-400"}`}
                style={{ height: `${row.revenue > 0 ? Math.max(6, row.revenue / max * 112) : 2}px` }} />
            </div>
          ))}
        </div>
        <div className="flex min-w-[670px] gap-1.5 pt-2">
          {sorted.map((row) => <div key={row.hour} className="min-w-0 flex-1 text-center text-[10px] text-slate-500">{row.hour % 2 === 0 ? String(row.hour).padStart(2, "0") : ""}</div>)}
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">Desplázate horizontalmente para ver todas las horas. La barra verde señala la hora actual.</p>
    </section>
  );
}

export function ControlToday({ greetingName, verse }: {
  greetingName: string;
  verse: { text: string; label: string };
}) {
  const [payload, setPayload] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [greetingMeta] = useState(() => {
    if (typeof window === "undefined") return { label: "Bienvenido", isNight: false };
    const hour = new Date().getHours();
    return { label: hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches", isNight: hour >= 19 };
  });

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const response = await fetch("/api/admin/control/kpis", { cache: "no-store" });
      if (!response.ok) throw new Error("No se pudieron consultar los datos de hoy.");
      const result = await response.json() as DashboardData;
      if (!result.todaySummary || !result.range) throw new Error("La API del panel diario todavía no está disponible.");
      setPayload(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar el panel.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const current = payload?.todaySummary;
  const finance = Boolean(payload?.financial);
  const metrics = payload?.metrics;
  const total = metrics?.netSales ?? 0;
  const completed = metrics?.completedSales ?? 0;
  const weeklyBase = current?.salesPreviousWeekSameHour ?? 0;
  const weeklyActual = current?.salesTodaySameHour ?? 0;
  const weeklyDelta = weeklyBase > 0 ? ((weeklyActual - weeklyBase) / weeklyBase) * 100 : null;

  const alerts = useMemo<Alert[]>(() => {
    if (!payload) return [];
    const result: Alert[] = [];
    if (finance && (current?.unpaidSales ?? 0) > 0) result.push({
      id: "unpaid", title: `${current?.unpaidSales} venta(s) con saldo pendiente`,
      detail: `Total pendiente: ${currency.format(current?.unpaidTotal ?? 0)} · según el saldo registrado en POS.`,
      href: "/control/ventas", tone: "rose",
    });
    if ((current?.pendingPosClosures ?? 0) > 0) result.push({
      id: "close", title: `${current?.pendingPosClosures} sesión(es) POS pendientes de cierre`,
      detail: "Revisa los cierres operativos de la jornada.",
      href: "/control/caja", tone: "amber",
    });
    if (finance && payload.criticalStock.length > 0) result.push({
      id: "stock", title: `${payload.criticalStock.length}${payload.criticalStock.length >= 12 ? "+" : ""} producto(s) con stock crítico`,
      detail: payload.criticalStock.slice(0, 2).map((item) => `${item.name} (${item.branchName}: ${item.quantity})`).join(" · "),
      href: "/control/productos", tone: "amber",
    });
    return result;
  }, [payload, finance, current]);

  return (
    <div className="space-y-5">
      {/* Mantener el encabezado personalizado de Principal: saludo + versículo del día. */}
      <section className="relative overflow-hidden rounded-2xl border border-sky-100 bg-[linear-gradient(135deg,#ffffff_0%,#f0f9ff_58%,#ecfdf5_100%)] p-5 shadow-sm sm:p-6">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-emerald-200/30 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-16 right-24 h-32 w-32 rounded-full bg-sky-200/40 blur-2xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-5">
          <div className="flex min-w-0 flex-wrap items-center gap-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/80 text-emerald-600 shadow-sm ring-1 ring-emerald-100">
                <FontAwesomeIcon icon={greetingMeta.isNight ? faMoon : faSun} className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-emerald-700" suppressHydrationWarning>{greetingMeta.label}</p>
                <p className="max-w-[220px] truncate text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">{greetingName}</p>
              </div>
            </div>
            <blockquote className="max-w-xl border-t border-emerald-100 pt-4 sm:border-l-2 sm:border-t-0 sm:border-emerald-300 sm:pl-5 sm:pt-0">
              <p className="text-sm italic leading-relaxed text-slate-600">&ldquo;{verse.text}&rdquo;</p>
              <p className="mt-1 text-xs font-medium text-emerald-700">{verse.label} · #CRISTOVIVE</p>
            </blockquote>
          </div>
          <div className="relative flex items-center gap-2">
            <div className="rounded-xl border border-emerald-100 bg-white/80 px-3 py-2 text-right">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-700">Solo hoy · Lima</p>
              <p className="text-xs font-semibold capitalize text-slate-900">{current?.updatedAt ? limaDate(current.updatedAt) : "Jornada actual"}</p>
              <p className="text-[11px] text-slate-500">{current?.updatedAt ? `Actualizado ${limaTime(current.updatedAt)}` : "Actualizando..."}</p>
            </div>
            <button type="button" onClick={() => void load(true)} disabled={refreshing}
              aria-label="Actualizar indicadores" title="Actualizar indicadores"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-100 bg-white text-emerald-700 hover:bg-emerald-50 disabled:opacity-60">
              <FontAwesomeIcon icon={faArrowRotateRight} className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </section>

      {error ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        {error} {payload ? "Se muestran los últimos datos obtenidos." : ""}
      </div> : null}
      {loading ? <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Cargando el resumen operativo de hoy...</section> : null}
      {!loading && !payload ? <button type="button" onClick={() => void load(true)}
        className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Reintentar</button> : null}

      {payload ? (
        <>
          <section>
            <SectionTitle title="Indicadores críticos del día" description="Datos de ventas completadas y operaciones vigentes; no depende del cierre de caja." />
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
              {finance ? <>
                <MetricCard title="Ventas hoy" value={currency.format(total)} icon={faChartLine} emphasized
                  hint="Facturación neta de ventas completadas"
                  detail={weeklyDelta === null ? <span className="text-slate-500">Sin base para comparar con el mismo día de la semana pasada.</span>
                    : <span className={weeklyDelta < 0 ? "font-semibold text-rose-700" : "font-semibold text-emerald-700"}>
                      {weeklyDelta > 0 ? "+" : ""}{weeklyDelta.toFixed(1)}% vs. el mismo día de la semana pasada, hasta esta hora
                    </span>} />
                <MetricCard title="Cobrado hoy" value={currency.format(current?.collectedToday ?? 0)} icon={faCashRegister}
                  hint="Pagos reales registrados, excluye crédito interno." />
              </> : null}
              <MetricCard title="Servicios del día" value={integer.format(metrics?.services ?? 0)} icon={faScissors}
                hint="Unidades de servicio en ventas completadas." />
              {finance ? <>
                <MetricCard title="Ticket promedio" value={completed ? currency.format(total / completed) : currency.format(0)} icon={faChartLine}
                  hint={`Ventas netas ÷ ${integer.format(completed)} ventas completadas.`} />
                <MetricCard title="Saldo pendiente" value={currency.format(current?.unpaidTotal ?? 0)} icon={faTriangleExclamation}
                  hint={`${current?.unpaidSales ?? 0} ventas con importe no pagado en POS.`} />
              </> : null}
              <MetricCard title="Reservas pendientes" value={integer.format(current?.pendingReservations ?? 0)} icon={faCalendarDays}
                hint="Reservas de hoy aún no completadas ni canceladas." />
            </div>
          </section>

          {finance ? (
            <section className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <SectionTitle title="Requiere atención" description="Alertas reales basadas en saldos, cierres y existencias registradas." />
                <div className="mt-4 space-y-2">
                  {alerts.length === 0 ? <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-4 text-sm font-medium text-emerald-800">
                    No hay alertas críticas detectadas con los datos disponibles.
                  </div> : alerts.map((alert) => (
                    <Link key={alert.id} href={alert.href} className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 transition hover:brightness-[.98] ${alert.tone === "rose" ? "border-rose-100 bg-rose-50" : alert.tone === "amber" ? "border-amber-100 bg-amber-50" : "border-sky-100 bg-sky-50"}`}>
                      <div className="flex min-w-0 gap-3">
                        <FontAwesomeIcon icon={faTriangleExclamation} className="mt-1 h-4 w-4 shrink-0 text-amber-700" />
                        <div><p className="text-sm font-semibold text-slate-900">{alert.title}</p><p className="mt-1 text-xs leading-5 text-slate-600">{alert.detail}</p></div>
                      </div>
                      <FontAwesomeIcon icon={faChevronRight} className="mt-1 h-3 w-3 shrink-0 text-slate-500" />
                    </Link>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <SectionTitle title="Pulso operativo" description="Situación de ventas, reservas y cajas durante la jornada." />
                <dl className="mt-4 divide-y divide-slate-100 text-sm">
                  <div className="flex justify-between gap-4 py-3"><dt className="text-slate-600">Ventas completadas</dt><dd className="font-bold text-slate-900">{integer.format(completed)}</dd></div>
                  <div className="flex justify-between gap-4 py-3"><dt className="text-slate-600">Ventas anuladas</dt><dd className="font-bold text-slate-900">{integer.format(metrics?.cancelledSales ?? 0)}</dd></div>
                  <div className="flex justify-between gap-4 py-3"><dt className="text-slate-600">Cajas abiertas</dt><dd className="font-bold text-slate-900">{integer.format(payload.sessions.length)}</dd></div>
                  <div className="flex justify-between gap-4 py-3"><dt className="text-slate-600">Cierres pendientes</dt><dd className="font-bold text-amber-700">{integer.format(current?.pendingPosClosures ?? 0)}</dd></div>
                  <div className="flex justify-between gap-4 py-3"><dt className="text-slate-600">Reservas por atender</dt><dd className="font-bold text-slate-900">{integer.format(current?.pendingReservations ?? 0)}</dd></div>
                </dl>
                <Link href="/control/control-ventas" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:underline">Ir a Control de ventas <FontAwesomeIcon icon={faChevronRight} className="h-3 w-3" /></Link>
              </div>
            </section>
          ) : null}

          {finance ? <section className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
            <HourlyChart rows={payload.salesByHour} updatedAt={current?.updatedAt ?? new Date().toISOString()} />
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <SectionTitle title="Top comercial de hoy" description="Servicios y productos con mayor número de unidades vendidas." />
              <div className="mt-5 grid gap-6 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <RankList title="Servicios" icon={faScissors} rows={payload.topServices ?? []} />
                <RankList title="Productos" icon={faBoxOpen} rows={payload.topProducts ?? []} />
              </div>
            </section>
          </section> : null}

          {finance ? <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <SectionTitle title="Desempeño por sede" description="Importes en tiempo operativo, incluso si la sesión POS aún está abierta." />
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {(current?.branches ?? []).length ? [...current!.branches].sort((a, b) => b.sales - a.sales).map((branch) => (
                <article key={branch.id} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold text-slate-900">{branch.name}</h3>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-medium ${branch.sessionStatus === "open" ? "bg-sky-100 text-sky-700" : branch.sessionStatus === "pending_close" ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-600"}`}>
                      {branch.sessionStatus === "open" ? "Caja abierta" : branch.sessionStatus === "pending_close" ? "Por cerrar" : branch.sessionStatus === "closed" ? "Caja cerrada" : "Sin sesión"}
                    </span>
                  </div>
                  <p className="mt-3 text-xl font-bold text-slate-950">{currency.format(branch.sales)}</p>
                  <div className="mt-3 flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-3 text-xs">
                    <span className="text-slate-500">Cobrado: <strong className="text-emerald-700">{currency.format(branch.collected)}</strong></span>
                    <span className="text-slate-500">Servicios: <strong className="text-slate-900">{integer.format(branch.services)}</strong></span>
                  </div>
                </article>
              )) : <p className="text-sm text-slate-500">No hay sedes disponibles para esta cuenta.</p>}
            </div>
          </section> : null}

          {!finance ? <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-600">Los indicadores financieros no están habilitados para tu rol. El estado de reservas refleja únicamente los datos autorizados.</p>
          </section> : null}
          <p className="flex items-center gap-2 text-xs text-slate-500"><FontAwesomeIcon icon={faClock} className="h-3 w-3" />
            Resumen limitado a la fecha operativa actual de Lima. Se actualiza automáticamente cada 60 segundos mientras esta pestaña está visible.
          </p>
        </>
      ) : null}
    </div>
  );
}
