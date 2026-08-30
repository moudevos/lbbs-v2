"use client";

import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatMoney } from "@/features/pos/pos-utils";

type Row = Record<string, unknown> & {
  id: string;
  direction: "income" | "expense";
  amount: number | string;
  status: string;
  entry_date: string;
  description: string;
};
type Option = {
  id: string;
  name: string;
  direction?: string;
  code?: string;
  financial_group?: string;
  affects_profit?: boolean;
};

const today = new Date().toLocaleDateString("en-CA", {
  timeZone: "America/Lima",
});
const startOfMonth = `${today.slice(0, 8)}01`;
const groupLabel: Record<string, string> = {
  operating_income: "Ingreso operativo",
  operating_expense: "Gasto operativo",
  personnel_cost: "Costo de personal",
  asset_movement: "Movimiento de inventario",
  receivable: "Cuenta por cobrar",
  financing: "Financiamiento o capital",
};
const asDate = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString("es-PE");

export function FinancePageClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [categories, setCategories] = useState<Option[]>([]);
  const [branches, setBranches] = useState<Option[]>([]);
  const [methods, setMethods] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dateFrom, setDateFrom] = useState(startOfMonth);
  const [dateTo, setDateTo] = useState(today);
  const [filterBranchId, setFilterBranchId] = useState("");
  const [direction, setDirection] = useState<"income" | "expense">("expense");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [entryDate, setEntryDate] = useState(today);
  const [entryBranchId, setEntryBranchId] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");

  const query = useMemo(
    () =>
      new URLSearchParams({
        dateFrom,
        dateTo,
        ...(filterBranchId ? { branchId: filterBranchId } : {}),
      }).toString(),
    [dateFrom, dateTo, filterBranchId],
  );
  const categoriesForDirection = categories.filter(
    (item) => item.direction === direction,
  );
  const manualIncome = rows
    .filter((row) => row.status === "active" && row.direction === "income")
    .reduce((sum, row) => sum + Number(row.amount), 0);
  const manualExpense = rows
    .filter((row) => row.status === "active" && row.direction === "expense")
    .reduce((sum, row) => sum + Number(row.amount), 0);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/finance?${query}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setRows(payload.data ?? []);
      setCategories(payload.categories ?? []);
      setBranches(payload.branches ?? []);
      setMethods(payload.paymentMethods ?? []);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo cargar finanzas.";
      console.error("[finance/ui] Error al cargar", { message });
      void Swal.fire({
        icon: "error",
        title: "No se pudo cargar finanzas",
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

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/admin/finance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction,
          categoryId,
          amount: Number(amount),
          description,
          branchId: entryBranchId,
          paymentMethodId,
          entryDate,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        await Swal.fire({
          icon: "warning",
          title: "No se pudo registrar",
          text: payload.error,
          confirmButtonColor: "#0f766e",
        });
        return;
      }
      setAmount("");
      setDescription("");
      setCategoryId("");
      await load();
    } finally {
      setSaving(false);
    }
  }
  async function cancel(id: string) {
    const result = await Swal.fire({
      title: "Anular movimiento",
      input: "text",
      inputLabel: "Motivo obligatorio",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      inputValidator: (value) =>
        value.trim() ? undefined : "Ingresa el motivo.",
    });
    if (!result.isConfirmed) return;
    const response = await fetch(`/api/admin/finance/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: result.value }),
    });
    const payload = await response.json();
    if (!response.ok) {
      await Swal.fire({
        icon: "error",
        title: "No se pudo anular",
        text: payload.error,
        confirmButtonColor: "#0f766e",
      });
      return;
    }
    await load();
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Libro financiero
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Registra cada ingreso o salida con su tipo económico y fecha
              contable.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              onClick={() => {
                setDateFrom(today);
                setDateTo(today);
              }}
            >
              Hoy
            </Button>
            <Button
              className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              onClick={() => {
                setDateFrom(startOfMonth);
                setDateTo(today);
              }}
            >
              Este mes
            </Button>
          </div>
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
              value={filterBranchId}
              onChange={(event) => setFilterBranchId(event.target.value)}
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
      <section className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
            Ingresos manuales
          </p>
          <strong className="mt-1 block text-xl text-emerald-800">
            {formatMoney(manualIncome)}
          </strong>
        </article>
        <article className="rounded-xl border border-rose-100 bg-rose-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-rose-700">
            Egresos manuales
          </p>
          <strong className="mt-1 block text-xl text-rose-800">
            {formatMoney(manualExpense)}
          </strong>
        </article>
        <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Saldo de movimientos
          </p>
          <strong className="mt-1 block text-xl text-slate-900">
            {formatMoney(manualIncome - manualExpense)}
          </strong>
        </article>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-slate-950">Registrar movimiento</h3>
        <p className="mt-1 text-sm text-slate-500">
          Préstamos, adelantos e inventario se registran, pero no se confunden
          con gastos que reducen la utilidad.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="text-sm font-medium">
            Tipo
            <Select
              className="mt-1"
              value={direction}
              onChange={(event) => {
                setDirection(event.target.value as "income" | "expense");
                setCategoryId("");
              }}
            >
              <option value="income">Ingreso</option>
              <option value="expense">Egreso</option>
            </Select>
          </label>
          <label className="text-sm font-medium">
            Concepto
            <Select
              className="mt-1"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              <option value="">Seleccionar concepto</option>
              {categoriesForDirection.map((item) => (
                <option key={item.id} value={item.id}>
                  {groupLabel[item.financial_group ?? ""] ?? "Movimiento"} ·{" "}
                  {item.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-sm font-medium">
            Monto
            <Input
              className="mt-1"
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
            />
          </label>
          <label className="text-sm font-medium">
            Fecha contable
            <Input
              className="mt-1"
              type="date"
              value={entryDate}
              onChange={(event) => setEntryDate(event.target.value)}
            />
          </label>
          <label className="text-sm font-medium">
            Sede
            <Select
              className="mt-1"
              value={entryBranchId}
              onChange={(event) => setEntryBranchId(event.target.value)}
            >
              <option value="">Sin sede / consolidado</option>
              {branches.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-sm font-medium">
            Método de pago
            <Select
              className="mt-1"
              value={paymentMethodId}
              onChange={(event) => setPaymentMethodId(event.target.value)}
            >
              <option value="">Sin método</option>
              {methods.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-sm font-medium md:col-span-3">
            Descripción del movimiento
            <Input
              className="mt-1"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Obligatoria. Ej.: alquiler de agosto, reparación de máquina o detalle de otro concepto."
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            disabled={saving || !categoryId || !amount || !description.trim()}
            onClick={() => void save()}
          >
            {saving ? "Guardando..." : "Registrar movimiento"}
          </Button>
        </div>
      </section>
      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b p-5">
          <h3 className="font-semibold text-slate-950">
            Movimientos del rango
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Los movimientos de préstamos, capital e inventario se distinguen en
            el análisis de resultados.
          </p>
        </div>
        <table className="min-w-[900px] w-full text-sm">
          <thead className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="p-3">Fecha</th>
              <th>Tipo</th>
              <th>Clasificación</th>
              <th>Sede</th>
              <th>Descripción</th>
              <th className="text-right">Monto</th>
              <th className="p-3 text-right">Acción</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-500">
                  Cargando movimientos...
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const category = row.category as {
                  name?: string;
                  financial_group?: string;
                } | null;
                return (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="p-3">{asDate(row.entry_date)}</td>
                    <td
                      className={
                        row.direction === "income"
                          ? "text-emerald-700"
                          : "text-rose-700"
                      }
                    >
                      {row.direction === "income" ? "Ingreso" : "Egreso"}
                    </td>
                    <td>{category?.name ?? "Sin categoría"}</td>
                    <td>
                      {String(
                        (row.branch as { name?: string } | null)?.name ??
                          "Sin sede",
                      )}
                    </td>
                    <td>{row.description}</td>
                    <td className="text-right font-medium">
                      {formatMoney(Number(row.amount))}
                    </td>
                    <td className="p-3 text-right">
                      {row.status === "active" ? (
                        <button
                          type="button"
                          onClick={() => void cancel(row.id)}
                          className="text-xs font-semibold text-rose-700 hover:underline"
                        >
                          Anular
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">Anulado</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
