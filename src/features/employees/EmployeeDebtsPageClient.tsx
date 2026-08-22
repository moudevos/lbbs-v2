"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/features/pos/pos-utils";

type Rel =
  | { name?: string; full_name?: string; settlement_number?: string }
  | null
  | Array<{ name?: string; full_name?: string; settlement_number?: string }>;
type Debt = {
  id: string;
  employee_id: string;
  branch_id: string;
  debt_type: string;
  original_amount: number;
  outstanding_amount: number;
  status: string;
  description: string;
  created_at: string;
  employee: Rel;
  branch: Rel;
};
type Movement = {
  id: string;
  debt_id: string;
  movement_type: string;
  amount: number;
  payment_reference: string | null;
  notes: string | null;
  created_at: string;
  payment_method: Rel;
  settlement: Rel;
};
type Data = {
  debts: Debt[];
  movements: Movement[];
  filters: {
    employees: Array<{
      id: string;
      full_name: string;
      document_number: string | null;
      branch_id: string;
    }>;
    branches: Array<{ id: string; name: string }>;
    paymentMethods: Array<{ id: string; name: string }>;
  };
  permissions?: { canRecordPayments?: boolean };
};
const rel = (value: Rel, key: "name" | "full_name" | "settlement_number") =>
  (Array.isArray(value) ? value[0] : value)?.[key] ?? "—";
const typeLabel: Record<string, string> = {
  loan: "Préstamo",
  advance: "Adelanto",
  supply: "Insumo",
  internal_credit: "Crédito POS",
  other: "Otro",
};
const stateLabel: Record<string, string> = {
  pending: "Pendiente",
  partial: "Parcial",
  paid: "Pagada",
  written_off: "Castigada",
  cancelled: "Anulada",
};
const movementLabel: Record<string, string> = {
  charge: "Cargo",
  immediate_payment: "Pago inmediato",
  settlement_deduction: "Descuento en liquidación",
  manual_payment: "Pago manual",
  adjustment: "Ajuste",
  write_off: "Castigo",
  cancellation: "Anulación",
};

export function EmployeeDebtsPageClient() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [employeeId, setEmployeeId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [status, setStatus] = useState("open");
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"" | "create" | "payment" | "history">("");
  const [debt, setDebt] = useState<Debt | null>(null);
  const [form, setForm] = useState<Record<string, string>>({
    debtType: "loan",
  });
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ status });
      if (employeeId) p.set("employeeId", employeeId);
      if (branchId) p.set("branchId", branchId);
      const r = await fetch(`/api/admin/employee-debts?${p}`, {
        cache: "no-store",
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error);
      setData(body);
    } catch (error) {
      await Swal.fire({
        icon: "error",
        title: "No se pudo cargar deudas",
        text: error instanceof Error ? error.message : "Error inesperado",
        confirmButtonColor: "#0f766e",
      });
    } finally {
      setLoading(false);
    }
  }, [branchId, employeeId, status]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const debts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.debts ?? []).filter(
      (item) =>
        !term ||
        `${rel(item.employee, "full_name")} ${item.description} ${item.debt_type}`
          .toLowerCase()
          .includes(term),
    );
  }, [data?.debts, search]);
  const total = debts.reduce(
    (sum, item) => sum + Number(item.outstanding_amount),
    0,
  );
  const people = new Set(
    debts
      .filter((item) => ["pending", "partial"].includes(item.status))
      .map((item) => item.employee_id),
  ).size;
  const history =
    data?.movements.filter((item) => item.debt_id === debt?.id) ?? [];
  const canRecordPayments = data?.permissions?.canRecordPayments !== false;
  const set = (key: string, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const create = () => {
    const employee = data?.filters.employees.find(
      (item) => item.id === employeeId,
    );
    setForm({
      debtType: "loan",
      employeeId,
      branchId: branchId || employee?.branch_id || "",
    });
    setDebt(null);
    setMode("create");
  };
  const pay = (item: Debt) => {
    if (!canRecordPayments) return;
    setDebt(item);
    setForm({ amount: String(item.outstanding_amount) });
    setMode("payment");
  };
  async function submit() {
    const payload =
      mode === "create"
        ? { action: "create", ...form }
        : { action: "payment", debtId: debt?.id, ...form };
    const r = await fetch("/api/admin/employee-debts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await r.json();
    if (!r.ok) {
      await Swal.fire({
        icon: "error",
        title: "No se pudo guardar",
        text: body.error,
        confirmButtonColor: "#0f766e",
      });
      return;
    }
    setMode("");
    await load();
    await Swal.fire({
      icon: "success",
      title: mode === "payment" ? "Pago registrado" : "Deuda registrada",
      timer: 1200,
      showConfirmButton: false,
    });
  }
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Cuenta corriente
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">
            Deudas de empleados
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Centraliza préstamos, adelantos, insumos y créditos originados en
            POS.
          </p>
        </div>
        <Button type="button" onClick={create}>
          Registrar deuda
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <article className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">Saldo pendiente</p>
          <p className="mt-1 text-2xl font-bold text-amber-950">
            {formatMoney(total)}
          </p>
        </article>
        <article className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
          <p className="text-sm text-sky-800">Empleados con saldo</p>
          <p className="mt-1 text-2xl font-bold text-sky-950">{people}</p>
        </article>
        <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm text-emerald-800">Deudas visibles</p>
          <p className="mt-1 text-2xl font-bold text-emerald-950">
            {debts.length}
          </p>
        </article>
      </div>
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-4">
          <Input
            placeholder="Buscar empleado o concepto"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
          >
            <option value="">Todas las sedes</option>
            {data?.filters.branches.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
          <Select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            <option value="">Todos los empleados</option>
            {data?.filters.employees.map((item) => (
              <option key={item.id} value={item.id}>
                {item.full_name}
              </option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="open">Pendientes y parciales</option>
            <option value="all">Todos los estados</option>
            <option value="paid">Pagadas</option>
            <option value="written_off">Castigadas</option>
            <option value="cancelled">Anuladas</option>
          </Select>
        </div>
      </section>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold">Mapa de deudas</h2>
          <p className="text-sm text-slate-500">
            El historial registra cada cargo, pago y descuento por liquidación.
          </p>
        </div>
        {loading ? (
          <p className="p-5 text-sm text-slate-500">
            Cargando cuenta corriente...
          </p>
        ) : debts.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">
            No hay deudas para los filtros seleccionados.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Empleado</th>
                  <th className="px-5 py-3">Origen</th>
                  <th className="px-5 py-3">Descripción</th>
                  <th className="px-5 py-3 text-right">Original</th>
                  <th className="px-5 py-3 text-right">Saldo</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {debts.map((item) => (
                  <tr key={item.id}>
                    <td className="px-5 py-3">
                      <p className="font-medium">
                        {rel(item.employee, "full_name")}
                      </p>
                      <p className="text-xs text-slate-500">
                        {rel(item.branch, "name")}
                      </p>
                    </td>
                    <td className="px-5 py-3">
                      {typeLabel[item.debt_type] ?? item.debt_type}
                    </td>
                    <td className="max-w-xs px-5 py-3 text-slate-600">
                      {item.description}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {formatMoney(Number(item.original_amount))}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold">
                      {formatMoney(Number(item.outstanding_amount))}
                    </td>
                    <td className="px-5 py-3">
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">
                        {stateLabel[item.status] ?? item.status}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          className="h-8 px-2 text-xs"
                          onClick={() => {
                            setDebt(item);
                            setMode("history");
                          }}
                        >
                          Historial
                        </Button>
                        {canRecordPayments &&
                        ["pending", "partial"].includes(item.status) ? (
                          <Button
                            type="button"
                            className="h-8 px-2 text-xs"
                            onClick={() => pay(item)}
                          >
                            Cobrar
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <Modal
        open={mode === "create"}
        title="Registrar deuda"
        description="Los créditos POS y las entregas de insumos a crédito se crean automáticamente; aquí registra cargos manuales."
        onClose={() => setMode("")}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              className="bg-white text-slate-700"
              onClick={() => setMode("")}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={() => void submit()}>
              Guardar deuda
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <label className="block text-sm font-medium">
            Empleado
            <Select
              value={form.employeeId ?? ""}
              onChange={(e) => {
                const employee = data?.filters.employees.find(
                  (item) => item.id === e.target.value,
                );
                setForm((current) => ({
                  ...current,
                  employeeId: e.target.value,
                  branchId: employee?.branch_id ?? current.branchId,
                }));
              }}
            >
              <option value="">Seleccionar empleado</option>
              {data?.filters.employees.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.full_name}
                  {item.document_number ? ` · ${item.document_number}` : ""}
                </option>
              ))}
            </Select>
          </label>
          <label className="block text-sm font-medium">
            Sede
            <Select
              value={form.branchId ?? ""}
              onChange={(e) => set("branchId", e.target.value)}
            >
              <option value="">Seleccionar sede</option>
              {data?.filters.branches.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="block text-sm font-medium">
            Tipo
            <Select
              value={form.debtType ?? "loan"}
              onChange={(e) => set("debtType", e.target.value)}
            >
              <option value="loan">Préstamo</option>
              <option value="advance">Adelanto</option>
              <option value="supply">Insumo pendiente</option>
              <option value="other">Otro cargo</option>
            </Select>
          </label>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            placeholder="Monto"
            value={form.amount ?? ""}
            onChange={(e) => set("amount", e.target.value)}
          />
          <Textarea
            placeholder="Motivo o descripción"
            value={form.description ?? ""}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>
      </Modal>
      <Modal
        open={mode === "payment"}
        title="Registrar pago"
        description={
          debt
            ? `${rel(debt.employee, "full_name")} · saldo ${formatMoney(Number(debt.outstanding_amount))}`
            : undefined
        }
        onClose={() => setMode("")}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              className="bg-white text-slate-700"
              onClick={() => setMode("")}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={() => void submit()}>
              Registrar pago
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input
            type="number"
            min="0.01"
            step="0.01"
            placeholder="Monto pagado"
            value={form.amount ?? ""}
            onChange={(e) => set("amount", e.target.value)}
          />
          <Select
            value={form.paymentMethodId ?? ""}
            onChange={(e) => set("paymentMethodId", e.target.value)}
          >
            <option value="">Método de pago (opcional)</option>
            {data?.filters.paymentMethods.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
          <Input
            placeholder="Referencia (opcional)"
            value={form.reference ?? ""}
            onChange={(e) => set("reference", e.target.value)}
          />
          <Textarea
            placeholder="Observación (opcional)"
            value={form.notes ?? ""}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>
      </Modal>
      <Modal
        open={mode === "history"}
        title="Historial de deuda"
        description={
          debt
            ? `${debt.description} · saldo actual ${formatMoney(Number(debt.outstanding_amount))}`
            : undefined
        }
        onClose={() => setMode("")}
        size="lg"
      >
        <div className="space-y-2">
          {history.length === 0 ? (
            <p className="text-sm text-slate-500">
              No hay movimientos registrados.
            </p>
          ) : (
            history.map((item) => (
              <article
                key={item.id}
                className="flex justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3"
              >
                <div>
                  <p className="font-medium">
                    {movementLabel[item.movement_type] ?? item.movement_type}
                  </p>
                  <p className="text-sm text-slate-600">
                    {item.notes || rel(item.settlement, "settlement_number")}
                  </p>
                  <p className="text-xs text-slate-500">
                    {new Date(item.created_at).toLocaleString("es-PE")}
                    {item.payment_reference
                      ? ` · Ref. ${item.payment_reference}`
                      : ""}
                  </p>
                </div>
                <strong>{formatMoney(Number(item.amount))}</strong>
              </article>
            ))
          )}
        </div>
      </Modal>
    </section>
  );
}
