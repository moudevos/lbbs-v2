"use client";

import { useEffect, useMemo, useState } from "react";

type Payload = {
  financial: boolean;
  metrics: Record<string, number | null>;
  paymentMethods: Array<{ code: string; name: string; total: number }>;
  range: { dateFrom: string; dateTo: string };
  internal: { employeeCredit: number; complimentaryRetail: number; complimentaryDiscount: number; benefitRetail: number; benefitDiscount: number };
  sessions: Array<{ id: string; branchName: string; status: string }>;
  branchReconciliations: Array<{ id: string; branchName: string; sessionStatus: string; grossSales: number; serviceGross: number; otherGross: number; rewardsCount: number; rewardsAmount: number; courtesyCost: number; employeeDebtCharges: number; operationalContribution: number; realSales: number; actualCollected: number }>;
};

type Branch = Payload["branchReconciliations"][number];

const paymentColors = ["#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#14b8a6", "#ec4899", "#64748b"];
const limaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());

type ControlKpisProps = {
  greetingName: string;
  verse: { text: string; label: string };
};

const money = (value: number | null) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(value ?? 0);

const number = (value: number | null) => new Intl.NumberFormat("es-PE").format(value ?? 0);

const percent = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0);
const percentLabel = (part: number, total: number) => `${percent(part, total).toFixed(1)}%`;

const sessionStatusLabel = (status: string) =>
  status === "closed" ? "Cerrada" : status === "open" ? "Abierta" : status === "pending_close" ? "Pendiente de cierre" : "Sin sesión";

const sessionStatusTone = (status: string) =>
  status === "closed" ? "bg-emerald-50 text-emerald-700" : status === "open" ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-700";

/* ---------------------------------- Icons --------------------------------- */
/* Hand-drawn, stroke-based, 24x24 — kept self-contained so no new deps are needed. */

type IconProps = { className?: string };
const iconBase = "h-5 w-5";

function IconTrendUp({ className = iconBase }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </svg>
  );
}

function IconReceipt({ className = iconBase }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  );
}

function IconCheckCircle({ className = iconBase }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.5 2.5 5-5" />
    </svg>
  );
}

function IconXCircle({ className = iconBase }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5l5 5M14.5 9.5l-5 5" />
    </svg>
  );
}

function IconSparkles({ className = iconBase }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 3l1.4 4.2L18 9l-4.6 1.8L12 15l-1.4-4.2L6 9l4.6-1.8L12 3z" />
      <path d="M19 15.5l.6 1.8L21 18l-1.4.7-.6 1.8-.6-1.8L17 18l1.4-.7.6-1.8z" />
    </svg>
  );
}

function IconBox({ className = iconBase }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 8l-9-5-9 5 9 5 9-5z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </svg>
  );
}

function IconStore({ className = iconBase }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 9l1-5h16l1 5" />
      <path d="M4 9v10h16V9" />
      <path d="M9 19v-5h6v5" />
    </svg>
  );
}

function IconSun({ className = iconBase }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </svg>
  );
}

function IconMoon({ className = iconBase }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
    </svg>
  );
}

function IconTag({ className = iconBase }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 3h6a2 2 0 0 1 2 2v6L11 20 2 11 12 3z" />
      <circle cx="15.5" cy="8.5" r="1.25" />
    </svg>
  );
}

function IconGift({ className = iconBase }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="9" width="18" height="12" rx="1" />
      <path d="M3 13h18" />
      <path d="M12 9v12" />
      <path d="M12 9c-1.8 0-3.2-1-3.2-2.6S9.6 3.5 11 4c1.1.4 1 2.7 1 5z" />
      <path d="M12 9c1.8 0 3.2-1 3.2-2.6S14.4 3.5 13 4c-1.1.4-1 2.7-1 5z" />
    </svg>
  );
}

function IconPercent({ className = iconBase }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M19 5L5 19" />
      <circle cx="7" cy="7" r="2.25" />
      <circle cx="17" cy="17" r="2.25" />
    </svg>
  );
}

/* ------------------------------- Building blocks ------------------------------- */

function FeaturedStat({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: "emerald" | "sky";
}) {
  const toneStyles =
    tone === "emerald"
      ? { bg: "from-emerald-50 to-white", ring: "ring-emerald-100", icon: "bg-emerald-600 text-white" }
      : { bg: "from-sky-50 to-white", ring: "ring-sky-100", icon: "bg-sky-600 text-white" };

  return (
    <article
      className={`col-span-2 flex items-center gap-4 rounded-2xl border border-slate-200 bg-gradient-to-br ${toneStyles.bg} p-5 shadow-sm ring-1 ${toneStyles.ring} sm:col-span-1`}
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${toneStyles.icon}`}>{icon}</span>
      <div>
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-[26px]">{value}</p>
      </div>
    </article>
  );
}

function HeroStat({
  label,
  value,
  icon,
  accent,
  hint,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: string;
  hint?: string;
}) {
  return (
    <article className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 ${accent ?? "text-slate-500"}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-slate-500">{label}</p>
        <p className={`mt-0.5 text-lg font-semibold tracking-tight ${accent ?? "text-slate-900"}`}>{value}</p>
        {hint ? <p className="truncate text-[11px] text-slate-400">{hint}</p> : null}
      </div>
    </article>
  );
}

function CompareBar({
  title,
  left,
  right,
  format = number,
}: {
  title: string;
  left: { label: string; value: number; color: string };
  right: { label: string; value: number; color: string };
  format?: (value: number) => string;
}) {
  const total = left.value + right.value;
  const leftPct = total > 0 ? (left.value / total) * 100 : 50;
  const rightPct = 100 - leftPct;

  return (
    <div>
      <p className="text-xs font-medium text-slate-500">{title}</p>
      <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-slate-100">
        {leftPct > 0 && (
          <div
            className="flex items-center justify-end pr-1.5 text-[9px] font-semibold text-white transition-all"
            style={{ width: `${leftPct}%`, backgroundColor: left.color }}
          />
        )}
        {rightPct > 0 && (
          <div
            className="flex items-center justify-start pl-1.5 text-[9px] font-semibold text-white transition-all"
            style={{ width: `${rightPct}%`, backgroundColor: right.color }}
          />
        )}
      </div>
      <div className="mt-2 flex justify-between gap-3 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: left.color }} />
          {left.label}: <strong className="font-semibold text-slate-900">{format(left.value)}</strong>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: right.color }} />
          {right.label}: <strong className="font-semibold text-slate-900">{format(right.value)}</strong>
        </span>
      </div>
    </div>
  );
}

function PaymentDonut({
  segments,
  centerLabel = "Cobrado",
  ariaLabel = "Distribución de métodos de pago",
}: {
  segments: Array<{ label: string; value: number; color: string }>;
  centerLabel?: string;
  ariaLabel?: string;
}) {
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
      <div className="relative h-28 w-28 shrink-0 rounded-full" style={{ background: gradient }} role="img" aria-label={ariaLabel}>
        <div className="absolute inset-2.5 flex flex-col items-center justify-center rounded-full bg-white text-center">
          <span className="text-[10px] text-slate-500">{centerLabel}</span>
          <span className="text-sm font-semibold text-slate-900">{money(total)}</span>
        </div>
      </div>
      <ul className="flex-1 space-y-2">
        {segments.map((s) => {
          const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
          return (
            <li key={s.label} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2 text-slate-600">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="truncate">{s.label}</span>
                <span className="text-xs text-slate-400">{pct}%</span>
              </span>
              <span className="font-medium text-slate-900">{money(s.value)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* Barras horizontales por sede: bruto, venta real y cobro real, con una escala común. */
function BranchBars({ branches }: { branches: Branch[] }) {
  const series = [
    { key: "grossSales" as const, label: "Bruto", color: "#0ea5e9" },
    { key: "realSales" as const, label: "Venta real", color: "#10b981" },
    { key: "actualCollected" as const, label: "Cobro real", color: "#6366f1" },
  ];
  const max = Math.max(1, ...branches.flatMap((b) => series.map((s) => b[s.key])));

  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="mt-4 space-y-5">
        {branches.map((branch, index) => (
          <div key={branch.id}>
            <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">
                {index + 1}
              </span>
              {branch.branchName}
            </p>
            <div className="mt-2 space-y-1.5">
              {series.map((s) => (
                <div key={s.key} className="flex items-center gap-3">
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${(branch[s.key] / max) * 100}%`, backgroundColor: s.color }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right text-xs font-medium text-slate-700">{money(branch[s.key])}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-slate-400">Ordenadas por cobro real, de mayor a menor.</p>
    </div>
  );
}

/* ---------------------------------- Component ---------------------------------- */

export function ControlKpis({ greetingName, verse }: ControlKpisProps) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState(false);
  const [dateFrom, setDateFrom] = useState(limaToday);
  const [dateTo, setDateTo] = useState(limaToday);

  // Derivado una sola vez en el render inicial del cliente — no necesita un
  // efecto porque no sincroniza con nada externo, solo calcula un valor.
  // El valor difiere entre servidor y cliente a propósito (depende de la
  // hora local del navegador), por eso se usa suppressHydrationWarning
  // donde se pinta, igual que recomienda React para casos tipo "hora actual".
  const [greetingMeta] = useState<{ label: string; isNight: boolean }>(() => {
    if (typeof window === "undefined") return { label: "Bienvenido", isNight: false };
    const hour = new Date().getHours();
    if (hour < 12) return { label: "Buenos días", isNight: false };
    if (hour < 19) return { label: "Buenas tardes", isNight: false };
    return { label: "Buenas noches", isNight: true };
  });

  useEffect(() => {
    void (async () => {
      try {
        const query = new URLSearchParams({ dateFrom, dateTo });
        const response = await fetch(`/api/admin/control/kpis?${query.toString()}`, { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error();
        setPayload(result);
        setError(false);
      } catch {
        console.error("[control/ui] Error al cargar KPIs operativos");
        setError(true);
      }
    })();
  }, [dateFrom, dateTo]);

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
  const internal = payload.internal;

  const paymentSegments = payload.paymentMethods.map((method, index) => ({
    label: method.name,
    value: method.total,
    color: paymentColors[index % paymentColors.length],
  }));

  /* ---- Derivados: solo cálculos sobre lo que ya llega del API ---- */
  const completed = m.completedSales ?? 0;
  const cancelled = m.cancelledSales ?? 0;
  const services = m.services ?? 0;
  const products = m.products ?? 0;
  const netSales = m.netSales ?? 0;
  const discounts = m.discounts ?? 0;

  const cancellationRate = percentLabel(cancelled, completed + cancelled);
  const discountRate = percentLabel(discounts, netSales + discounts);
  const servicesMix = percentLabel(services, services + products);

  const branches = [...payload.branchReconciliations].sort((a, b) => b.actualCollected - a.actualCollected);
  const branchSegments = branches.map((branch, index) => ({
    label: branch.branchName,
    value: branch.actualCollected,
    color: paymentColors[index % paymentColors.length],
  }));

  const totalGross = branches.reduce((sum, b) => sum + b.grossSales, 0);
  const totalCourtesyCost = branches.reduce((sum, b) => sum + b.courtesyCost, 0);
  const courtesyCostRate = percentLabel(totalCourtesyCost, totalGross);

  const statusCounts = branches.reduce<Record<string, number>>((acc, branch) => {
    acc[branch.sessionStatus] = (acc[branch.sessionStatus] ?? 0) + 1;
    return acc;
  }, {});
  const statusOrder = ["open", "pending_close", "closed"];
  const statusEntries = [
    ...statusOrder.filter((s) => statusCounts[s]).map((s) => [s, statusCounts[s]] as const),
    ...Object.entries(statusCounts).filter(([s]) => !statusOrder.includes(s)),
  ];

  const hasBranches = branches.length > 0;

  return (
    <div className="space-y-4">
      {/* Bienvenida */}
      <section className="relative overflow-hidden rounded-2xl border border-sky-100 bg-[linear-gradient(135deg,#ffffff_0%,#f0f9ff_58%,#ecfdf5_100%)] p-5 shadow-sm sm:p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-emerald-200/30 blur-2xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-16 right-24 h-32 w-32 rounded-full bg-sky-200/40 blur-2xl"
        />

        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:gap-8">
          {/* Izquierda: bienvenida + versículo */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6 lg:shrink-0">
            <div className="flex items-center gap-3 sm:w-60 sm:shrink-0">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/80 text-emerald-600 shadow-sm ring-1 ring-emerald-100">
                {greetingMeta.isNight ? <IconMoon className="h-5 w-5" /> : <IconSun className="h-5 w-5" />}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-emerald-700" suppressHydrationWarning>
                  {greetingMeta.label}
                </p>
                <p className="mt-0.5 truncate text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
                  {greetingName}
                </p>
              </div>
            </div>
            <blockquote className="border-t border-emerald-100 pt-4 sm:border-l-2 sm:border-t-0 sm:border-emerald-300 sm:pl-5 sm:pt-0">
              <p className="text-sm italic leading-relaxed text-slate-600">&ldquo;{verse.text}&rdquo;</p>
              <p className="mt-1 text-xs font-medium text-emerald-700">{verse.label} · #CRISTOVIVE</p>
            </blockquote>
          </div>

          {/* Derecha: filtro de fechas ocupando todo el espacio restante */}
          {payload.financial ? (
            <div className="grid grid-cols-1 gap-3 border-t border-emerald-100 pt-4 sm:grid-cols-2 lg:min-w-0 lg:flex-1 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
              <label className="text-xs font-medium text-slate-500">
                Desde
                <input
                  type="date"
                  value={dateFrom}
                  max={dateTo}
                  onChange={(event) => setDateFrom(event.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-slate-500">
                Hasta
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom}
                  onChange={(event) => setDateTo(event.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                />
              </label>
              <p className="text-xs text-slate-500 sm:col-span-2">Rango por fecha operativa Lima.</p>
            </div>
          ) : null}
        </div>
      </section>

      {/* Cifras clave — la más importante primero, en tamaño destacado */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {payload.financial ? (
          <>
            <FeaturedStat label="Ventas netas del periodo" value={money(m.netSales)} icon={<IconTrendUp />} tone="emerald" />
            <HeroStat label="Ticket promedio" value={money(m.averageTicket)} icon={<IconReceipt className="h-[18px] w-[18px]" />} />
            <HeroStat
              label="Ventas completadas"
              value={number(m.completedSales)}
              icon={<IconCheckCircle className="h-[18px] w-[18px]" />}
              accent="text-emerald-700"
            />
            <HeroStat
              label="Ventas anuladas"
              value={number(m.cancelledSales)}
              icon={<IconXCircle className="h-[18px] w-[18px]" />}
              accent="text-amber-700"
              hint={`${cancellationRate} de las ventas`}
            />
          </>
        ) : (
          <>
            <FeaturedStat label="Ventas completadas" value={number(m.completedSales)} icon={<IconCheckCircle />} tone="sky" />
            <HeroStat
              label="Ventas anuladas"
              value={number(m.cancelledSales)}
              icon={<IconXCircle className="h-[18px] w-[18px]" />}
              accent="text-amber-700"
              hint={`${cancellationRate} de las ventas`}
            />
            <HeroStat label="Servicios realizados" value={number(m.services)} icon={<IconSparkles className="h-[18px] w-[18px]" />} />
            <HeroStat label="Productos vendidos" value={number(m.products)} icon={<IconBox className="h-[18px] w-[18px]" />} />
          </>
        )}
      </section>

      {/* Indicadores derivados */}
      {payload.financial ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <HeroStat
            label="Tasa de anulación"
            value={cancellationRate}
            icon={<IconXCircle className="h-[18px] w-[18px]" />}
            accent="text-amber-700"
            hint={`${number(cancelled)} de ${number(completed + cancelled)} ventas`}
          />
          <HeroStat
            label="Descuento sobre venta"
            value={discountRate}
            icon={<IconPercent className="h-[18px] w-[18px]" />}
            hint={`${money(discounts)} aplicados`}
          />
          <HeroStat
            label="Servicios en el mix"
            value={servicesMix}
            icon={<IconSparkles className="h-[18px] w-[18px]" />}
            accent="text-sky-700"
            hint={`${number(services)} servicios · ${number(products)} productos`}
          />
          <HeroStat
            label="Costo de cortesías / bruto"
            value={courtesyCostRate}
            icon={<IconGift className="h-[18px] w-[18px]" />}
            accent="text-rose-700"
            hint={`${money(totalCourtesyCost)} sobre ${money(totalGross)}`}
          />
        </section>
      ) : null}

      {payload.financial && (
        <section className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-900">Métodos de pago</p>
            <div className="mt-4">
              <PaymentDonut segments={paymentSegments} />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-900">Descuentos y cortesías</p>
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-amber-600 shadow-sm">
                  <IconTag className="h-4 w-4" />
                </span>
                <span className="flex-1 text-sm text-slate-600">Descuentos aplicados</span>
                <span className="text-sm font-semibold text-slate-900">{money(m.discounts)}</span>
              </div>
              <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-emerald-600 shadow-sm">
                  <IconGift className="h-4 w-4" />
                </span>
                <span className="flex-1 text-sm text-slate-600">Cortesías</span>
                <span className="text-sm font-semibold text-slate-900">{money(m.courtesies)}</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Comparativo por sede */}
      {payload.financial && hasBranches ? (
        <section className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-900">Comparativo por sede</p>
            <p className="mt-1 text-xs text-slate-500">Bruto, venta real y cobro real de cada sede en el periodo.</p>
            <div className="mt-4">
              <BranchBars branches={branches} />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-900">Participación por sede</p>
            <p className="mt-1 text-xs text-slate-500">Qué parte del cobro real aporta cada sede.</p>
            <div className="mt-4">
              <PaymentDonut segments={branchSegments} centerLabel="Cobro real" ariaLabel="Participación de cada sede en el cobro real" />
            </div>
          </div>
        </section>
      ) : null}

      {/* Resultados y operaciones internas */}
      {payload.financial ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Resultados y operaciones internas</p>
          <p className="mt-1 text-xs text-slate-500">No incrementan caja ni ventas cobradas si no existe pago real.</p>
          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
            <article className="flex items-center justify-between rounded-xl bg-slate-50 p-4 lg:flex-col lg:items-start lg:justify-center lg:gap-1">
              <p className="text-xs text-slate-500">Crédito de empleados</p>
              <p className="text-lg font-semibold text-slate-900">{money(internal.employeeCredit)}</p>
            </article>
            <div className="grid gap-5 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
              <CompareBar
                title="Beneficios: valor lista vs. descuento"
                format={money}
                left={{ label: "Valor lista", value: internal.benefitRetail, color: "#0ea5e9" }}
                right={{ label: "Descuento", value: internal.benefitDiscount, color: "#f59e0b" }}
              />
              <CompareBar
                title="Consumo dueño: valor lista vs. descuento"
                format={money}
                left={{ label: "Valor lista", value: internal.complimentaryRetail, color: "#8b5cf6" }}
                right={{ label: "Descuento", value: internal.complimentaryDiscount, color: "#f59e0b" }}
              />
            </div>
          </div>
        </section>
      ) : null}

      {/* Operación */}
      {hasBranches ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-900">Conciliación diaria por sede</p>
              <p className="mt-1 text-xs text-slate-500">Ventas por fecha operativa; el cierre real excluye crédito interno y muestra solo pagos registrados.</p>
            </div>
            <span className="text-xs text-slate-500">{payload.range.dateFrom} al {payload.range.dateTo}</span>
          </div>

          {/* Estado de sedes */}
          <div className="mt-4 flex flex-wrap gap-2">
            {statusEntries.map(([status, count]) => (
              <span key={status} className={`rounded-full px-3 py-1 text-xs font-medium ${sessionStatusTone(status)}`}>
                {sessionStatusLabel(status)}: {count}
              </span>
            ))}
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-3">
            {branches.map((branch) => {
              const gap = branch.realSales - branch.actualCollected;
              const rewardAvg = branch.rewardsCount > 0 ? branch.rewardsAmount / branch.rewardsCount : 0;
              return (
                <article key={branch.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-slate-900">{branch.branchName}</p>
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${sessionStatusTone(branch.sessionStatus)}`}>
                      {sessionStatusLabel(branch.sessionStatus)}
                    </span>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div>
                      <dt className="text-xs text-slate-500">Bruto total</dt>
                      <dd className="font-semibold">{money(branch.grossSales)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Aportes de producción</dt>
                      <dd>{money(branch.operationalContribution)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Servicios</dt>
                      <dd>{money(branch.serviceGross)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Productos y otras categorías</dt>
                      <dd>{money(branch.otherGross)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Rewards cobrados</dt>
                      <dd>{branch.rewardsCount} · {money(branch.rewardsAmount)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Promedio por reward</dt>
                      <dd>{money(rewardAvg)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Costo de cortesías</dt>
                      <dd className="text-rose-700">-{money(branch.courtesyCost)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Deudas de empleados del día</dt>
                      <dd>{money(branch.employeeDebtCharges)}</dd>
                    </div>
                  </dl>

                  <div className="mt-4">
                    <CompareBar
                      title="Servicios vs. productos y otras categorías"
                      format={money}
                      left={{ label: "Servicios", value: branch.serviceGross, color: "#0ea5e9" }}
                      right={{ label: "Otras", value: branch.otherGross, color: "#6366f1" }}
                    />
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-200 pt-4">
                    <div className="rounded-lg bg-white p-3">
                      <p className="text-xs text-slate-500">Total real de venta</p>
                      <p className="mt-1 font-semibold text-slate-900">{money(branch.realSales)}</p>
                    </div>
                    <div className="rounded-lg bg-emerald-600 p-3 text-white">
                      <p className="text-xs text-emerald-100">Total real de cobro</p>
                      <p className="mt-1 text-lg font-bold">{money(branch.actualCollected)}</p>
                    </div>
                  </div>

                  <div
                    className={`mt-3 flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium ${
                      gap > 0 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    <span>{gap > 0 ? "Venta sin cobrar" : "Venta totalmente cobrada"}</span>
                    <span>{money(Math.max(gap, 0))}</span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

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
                className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
              >
                <IconStore className="h-3.5 w-3.5" />
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