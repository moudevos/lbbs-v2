"use client";

import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatMoney } from "@/features/pos/pos-utils";

type Branch = {
  id: string;
  name: string;
  grossSales: number;
  clientDiscounts: number;
  netSales: number;
  serviceSales: number;
  otherCategorySales: number;
  productCost: number;
  courtesyCost: number;
  courtesyReserve: number;
  courtesyReserveBalance: number;
  profitIncome: number;
  profitExpenses: number;
  cashOnlyIncome: number;
  cashOnlyOutflows: number;
  unknownCostItems: number;
  operatingResult: number;
};
type Analysis = {
  totals: Omit<Branch, "id" | "name">;
  branches: Branch[];
  dailySales: {
    date: string;
    grossSales: number;
    netSales: number;
    expenses: number;
  }[];
  barberDaily: { date: string; barber: string; sales: number }[];
  expensesByCategory: { name: string; amount: number }[];
  expenseDetails: {
    date: string;
    branchId: string;
    branch: string;
    category: string;
    group: string;
    description: string;
    amount: number;
    affectsProfit: boolean;
  }[];
};
type Option = { id: string; name: string };
type ChartKey = "daily" | "barber" | "expense" | "mix";

const today = new Date().toLocaleDateString("en-CA", {
  timeZone: "America/Lima",
});
const startOfMonth = `${today.slice(0, 8)}01`;
const asDate = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString("es-PE");
const chartLabels: Record<ChartKey, string> = {
  daily: "Ventas por día",
  barber: "Ventas por barbero y día",
  expense: "Gastos por categoría",
  mix: "Composición de ventas",
};

function Metric({
  label,
  value,
  tone = "text-slate-950",
  note,
}: {
  label: string;
  value: number;
  tone?: string;
  note?: string;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={`mt-1 text-xl font-bold ${tone}`}>{formatMoney(value)}</p>
      {note ? <p className="mt-1 text-xs text-slate-500">{note}</p> : null}
    </article>
  );
}
function Bars({
  title,
  rows,
  color = "bg-emerald-500",
}: {
  title: string;
  rows: { label: string; value: number }[];
  color?: string;
}) {
  const maximum = Math.max(1, ...rows.map((row) => row.value));
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="font-semibold text-slate-950">{title}</h3>
      {rows.length ? (
        <div className="mt-4 space-y-3">
          {rows.slice(0, 14).map((row) => (
            <div key={row.label}>
              <div className="mb-1 flex justify-between gap-3 text-sm">
                <span className="truncate text-slate-600">{row.label}</span>
                <strong className="shrink-0 text-slate-900">
                  {formatMoney(row.value)}
                </strong>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${color}`}
                  style={{
                    width: `${Math.max(row.value > 0 ? 3 : 0, (row.value / maximum) * 100)}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-slate-500">
          Sin datos para el rango seleccionado.
        </p>
      )}
    </article>
  );
}

export function FinancialAnalysisPageClient() {
  const [branches, setBranches] = useState<Option[]>([]);
  const [data, setData] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(startOfMonth);
  const [dateTo, setDateTo] = useState(today);
  const [branchId, setBranchId] = useState("");
  const [statementId, setStatementId] = useState<string | null>(null);
  const [visibleCharts, setVisibleCharts] = useState<Record<ChartKey, boolean>>(
    { daily: true, barber: true, expense: true, mix: true },
  );
  const query = useMemo(
    () =>
      new URLSearchParams({
        dateFrom,
        dateTo,
        ...(branchId ? { branchId } : {}),
      }).toString(),
    [dateFrom, dateTo, branchId],
  );
  useEffect(() => {
    const stored = window.localStorage.getItem("lbbs-finance-analysis-charts");
    if (stored) {
      try {
        setVisibleCharts({ ...visibleCharts, ...JSON.parse(stored) });
      } catch {
        /* ignore malformed local preference */
      }
    }
  }, []);
  function toggleChart(chart: ChartKey) {
    setVisibleCharts((current) => {
      const next = { ...current, [chart]: !current[chart] };
      window.localStorage.setItem(
        "lbbs-finance-analysis-charts",
        JSON.stringify(next),
      );
      return next;
    });
  }
  async function load() {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/finance/analysis?${query}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setData(payload);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo cargar el análisis.";
      console.error("[finance-analysis/ui] Error", { message });
      void Swal.fire({
        icon: "error",
        title: "No se pudo cargar el análisis",
        text: message,
        confirmButtonColor: "#0f766e",
      });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [query]);
  const selected =
    statementId === "all"
      ? null
      : (data?.branches.find((item) => item.id === statementId) ?? null);
  const statement =
    selected ?? (statementId === "all" ? (data?.totals ?? null) : null);
  const statementName = selected?.name ?? "Consolidado de sedes";
  const statementExpenseRows =
    statementId && statementId !== "all"
      ? (data?.expenseDetails.filter((item) => item.branchId === statementId) ??
        [])
      : (data?.expenseDetails ?? []);
  const statementExpenses = statementExpenseRows.filter(
    (item) => item.affectsProfit,
  );
  const expenseCategories = Object.values(
    (statementExpenses ?? []).reduce<
      Record<string, { name: string; amount: number }>
    >((result, item) => {
      const current = result[item.category] ?? {
        name: item.category,
        amount: 0,
      };
      current.amount += item.amount;
      result[item.category] = current;
      return result;
    }, {}),
  ).sort((a, b) => b.amount - a.amount);
  const courtesyStatus = statement
    ? statement.courtesyReserveBalance >= 0
      ? "El aporte cubre el costo de las cortesías entregadas."
      : "Las cortesías costaron más que el aporte generado."
    : "";
  if (statement)
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Estado de cuenta
            </p>
            <h2 className="mt-1 text-2xl font-bold text-slate-950">
              {statementName}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Del {asDate(dateFrom)} al {asDate(dateTo)}. Solo registra costos y
              gastos con datos disponibles.
            </p>
          </div>
          <Button
            className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            onClick={() => setStatementId(null)}
          >
            Volver al análisis
          </Button>
        </div>
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Metric label="Ventas brutas" value={statement.grossSales} />
          <Metric
            label="Descuentos al cliente"
            value={statement.clientDiscounts}
            tone="text-rose-700"
          />
          <Metric
            label="Ventas netas"
            value={statement.netSales}
            tone="text-emerald-700"
          />
          <Metric
            label="Resultado registrado"
            value={statement.operatingResult}
            tone={
              statement.operatingResult >= 0
                ? "text-emerald-700"
                : "text-rose-700"
            }
          />
        </section>
        <section className="grid gap-5 lg:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-slate-950">
              Cómo se distribuye una venta
            </h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt>Ventas por servicios</dt>
                <dd className="font-semibold">
                  {formatMoney(statement.serviceSales)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Ventas de otras categorías</dt>
                <dd className="font-semibold">
                  {formatMoney(statement.otherCategorySales)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Aporte operativo generado</dt>
                <dd className="font-semibold text-indigo-700">
                  {formatMoney(statement.courtesyReserve)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Costo real de cortesías</dt>
                <dd className="font-semibold text-rose-700">
                  -{formatMoney(statement.courtesyCost)}
                </dd>
              </div>
              <div className="flex justify-between border-t pt-3">
                <dt className="font-semibold">
                  Saldo de aporte para cortesías
                </dt>
                <dd
                  className={`font-bold ${statement.courtesyReserveBalance >= 0 ? "text-emerald-700" : "text-rose-700"}`}
                >
                  {formatMoney(statement.courtesyReserveBalance)}
                </dd>
              </div>
            </dl>
            <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              {courtesyStatus} El aporte reduce la base de comisión del barbero;
              no es un gasto hasta que se entrega una cortesía con costo real.
            </p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-slate-950">
              Costos y gastos registrados
            </h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt>Costo de productos vendidos</dt>
                <dd className="font-semibold text-rose-700">
                  -{formatMoney(statement.productCost)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Gastos y pagos que afectan utilidad</dt>
                <dd className="font-semibold text-rose-700">
                  -{formatMoney(statement.profitExpenses)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Otros ingresos operativos</dt>
                <dd className="font-semibold text-emerald-700">
                  {formatMoney(statement.profitIncome)}
                </dd>
              </div>
              <div className="flex justify-between border-t pt-3">
                <dt className="font-semibold">
                  Movimientos de caja sin efecto en utilidad
                </dt>
                <dd className="font-semibold">
                  {formatMoney(
                    statement.cashOnlyIncome - statement.cashOnlyOutflows,
                  )}
                </dd>
              </div>
            </dl>
            {statement.unknownCostItems ? (
              <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                Hay {statement.unknownCostItems} producto(s) sin costo
                registrado. El resultado puede estar sobreestimado.
              </p>
            ) : null}
          </article>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b p-5">
            <h3 className="font-semibold text-slate-950">
              Egresos que afectan el resultado
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Cada registro muestra el concepto y la descripción escrita al
              registrarlo.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-sm">
              <thead className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="p-3">Fecha</th>
                  <th>Concepto</th>
                  <th>Descripción</th>
                  <th className="text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {statementExpenses?.length ? (
                  statementExpenses.map((item, index) => (
                    <tr
                      key={`${item.date}-${item.description}-${index}`}
                      className="border-b border-slate-100"
                    >
                      <td className="p-3">{asDate(item.date)}</td>
                      <td>{item.category}</td>
                      <td>{item.description}</td>
                      <td className="text-right font-semibold text-rose-700">
                        {formatMoney(item.amount)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-500">
                      No hay egresos registrados que afecten el resultado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Análisis financiero
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Separa utilidad, aporte operativo para cortesías y movimientos de
              caja.
            </p>
          </div>
          <Button onClick={() => setStatementId("all")}>Ver consolidado</Button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="text-sm font-medium text-slate-700">
            Desde
            <Input
              className="mt-1"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Hasta
            <Input
              className="mt-1"
              type="date"
              min={dateFrom}
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Sede
            <Select
              className="mt-1"
              value={branchId}
              onChange={(event) => setBranchId(event.target.value)}
            >
              <option value="">Todas las sedes</option>
              {branches.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Ventas brutas" value={data?.totals.grossSales ?? 0} />
        <Metric
          label="Descuentos al cliente"
          value={data?.totals.clientDiscounts ?? 0}
          tone="text-rose-700"
        />
        <Metric
          label="Ventas netas"
          value={data?.totals.netSales ?? 0}
          tone="text-emerald-700"
        />
        <Metric
          label="Aporte para cortesías"
          value={data?.totals.courtesyReserve ?? 0}
          tone="text-indigo-700"
        />
        <Metric
          label="Resultado registrado"
          value={data?.totals.operatingResult ?? 0}
          tone={
            (data?.totals.operatingResult ?? 0) >= 0
              ? "text-emerald-700"
              : "text-rose-700"
          }
        />
      </section>
      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b p-5">
          <h3 className="font-semibold text-slate-950">Resultado por sede</h3>
          <p className="mt-1 text-sm text-slate-500">
            Las deudas, préstamos y compras de inventario se muestran aparte: no
            son pérdida del período.
          </p>
        </div>
        <table className="min-w-[1100px] w-full text-sm">
          <thead className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="p-3">Sede</th>
              <th className="text-right">Ventas brutas</th>
              <th className="text-right">Servicios</th>
              <th className="text-right">Otras categorías</th>
              <th className="text-right">Aporte cortesías</th>
              <th className="text-right">Costo cortesías</th>
              <th className="text-right">Resultado</th>
              <th className="p-3 text-right">Acción</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-slate-500">
                  Calculando análisis...
                </td>
              </tr>
            ) : (
              data?.branches.map((item) => (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="p-3 font-semibold">{item.name}</td>
                  <td className="text-right">{formatMoney(item.grossSales)}</td>
                  <td className="text-right">
                    {formatMoney(item.serviceSales)}
                  </td>
                  <td className="text-right">
                    {formatMoney(item.otherCategorySales)}
                  </td>
                  <td className="text-right text-indigo-700">
                    {formatMoney(item.courtesyReserve)}
                  </td>
                  <td className="text-right text-rose-700">
                    {formatMoney(item.courtesyCost)}
                  </td>
                  <td
                    className={`text-right font-bold ${item.operatingResult >= 0 ? "text-emerald-700" : "text-rose-700"}`}
                  >
                    {formatMoney(item.operatingResult)}
                  </td>
                  <td className="p-3 text-right">
                    <Button
                      className="h-8 border border-slate-300 bg-white px-3 text-xs text-slate-700 hover:bg-slate-50"
                      onClick={() => setStatementId(item.id)}
                    >
                      Estado de cuenta
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-950">Gráficas</h3>
            <p className="mt-1 text-sm text-slate-500">
              Personaliza qué indicadores quieres ver. Se guarda en este
              navegador.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(chartLabels) as ChartKey[]).map((key) => (
              <label
                key={key}
                className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-700"
              >
                <input
                  type="checkbox"
                  checked={visibleCharts[key]}
                  onChange={() => toggleChart(key)}
                />
                {chartLabels[key]}
              </label>
            ))}
          </div>
        </div>
      </section>
      <section className="grid gap-5 lg:grid-cols-2">
        {visibleCharts.daily ? (
          <Bars
            title="Picos de venta por día"
            rows={(data?.dailySales ?? []).map((item) => ({
              label: asDate(item.date),
              value: item.netSales,
            }))}
          />
        ) : null}
        {visibleCharts.barber ? (
          <Bars
            title="Ventas por barbero y día"
            rows={(data?.barberDaily ?? []).map((item) => ({
              label: `${asDate(item.date)} · ${item.barber}`,
              value: item.sales,
            }))}
            color="bg-indigo-500"
          />
        ) : null}
        {visibleCharts.expense ? (
          <Bars
            title="Gastos por categoría"
            rows={(data?.expensesByCategory ?? []).map((item) => ({
              label: item.name,
              value: item.amount,
            }))}
            color="bg-rose-500"
          />
        ) : null}
        {visibleCharts.mix ? (
          <Bars
            title="Composición de ventas"
            rows={[
              { label: "Servicios", value: data?.totals.serviceSales ?? 0 },
              {
                label: "Otras categorías",
                value: data?.totals.otherCategorySales ?? 0,
              },
            ]}
            color="bg-sky-500"
          />
        ) : null}
      </section>
    </div>
  );
}
