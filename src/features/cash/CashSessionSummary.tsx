"use client";

import type { CashSummaryRecord } from "@/features/cash/cash-types";

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

type CashSessionSummaryProps = {
  summary: CashSummaryRecord | null;
};

const labels = [
  { key: "openingCashAmount", title: "Monto inicial" },
  { key: "cashSalesAmount", title: "Ventas en efectivo" },
  { key: "operationalIncome", title: "Ingresos operativos" },
  { key: "operationalExpense", title: "Egresos operativos" },
  { key: "withdrawals", title: "Retiros" },
  { key: "adjustments", title: "Ajustes" },
  { key: "netOperationalAmount", title: "Neto operativo" },
  { key: "expectedCashAmount", title: "Efectivo esperado" },
] as const;

export function CashSessionSummary({ summary }: CashSessionSummaryProps) {
  if (!summary) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">Resumen de caja</p>
          <p className="mt-1 text-sm text-slate-600">
            {summary.branchName ?? "Sede"} - {summary.sessionId ? `Sesion activa #${summary.sessionId.slice(0, 8).toUpperCase()}` : "Sin sesion POS abierta"}
          </p>
          {summary.openedAt ? (
            <p className="mt-1 text-xs text-slate-500">
              Abierta por {summary.openedByName ?? "Sin registro"} el {formatDateTime(summary.openedAt)}
            </p>
          ) : null}
        </div>
        <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
          {summary.status === "open" ? "Sesion abierta" : "Historial de sede"}
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {labels.map((item) => (
          <article key={item.key} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">{item.title}</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{formatMoney(summary[item.key])}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
