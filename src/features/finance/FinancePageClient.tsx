"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/Modal";
import { OperationOverlay } from "@/components/ui/OperationOverlay";
import { Select } from "@/components/ui/select";
import { formatMoney } from "@/features/pos/pos-utils";

type Row = Record<string, unknown> & {
  id: string;
  direction: "income" | "expense";
  amount: number | string;
  status: string;
  entry_date: string;
  description: string;
  payment_status?: "paid" | "pending";
  outstanding_amount?: number | string;
};
type Option = {
  id: string;
  name: string;
  direction?: string;
  code?: string;
  financial_group?: string;
  affects_profit?: boolean;
  is_manual_selectable?: boolean;
};
type Payable = {
  id: string;
  accounting_date: string;
  original_amount: number | string;
  outstanding_amount: number | string;
  status: "open" | "pending" | "partial" | "paid" | "cancelled";
  due_date: string | null;
  description: string;
  branch?: { name?: string } | { name?: string }[] | null;
  payments?: Array<{
    id: string;
    amount: number | string;
    paid_at: string;
    reference: string | null;
    status: "posted" | "voided";
    reversed_at: string | null;
    reversal_reason_code: string | null;
    reversal_reason: string | null;
    payment_method?: { name?: string } | { name?: string }[] | null;
  }>;
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
const payableStatusLabel: Record<Payable["status"], string> = {
  open: "Pendiente",
  pending: "Pendiente",
  partial: "Parcial",
  paid: "Pagada",
  cancelled: "Anulada",
};

export function FinancePageClient() {
  const [financeTab, setFinanceTab] = useState<"payments" | "payables" | "operations">("payments");
  const [rows, setRows] = useState<Row[]>([]);
  const [categories, setCategories] = useState<Option[]>([]);
  const [branches, setBranches] = useState<Option[]>([]);
  const [methods, setMethods] = useState<Option[]>([]);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
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
  const [paymentStatus, setPaymentStatus] = useState<"paid" | "pending">("paid");
  const [dueDate, setDueDate] = useState("");
  const [reference, setReference] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [cancelEntryId, setCancelEntryId] = useState<string | null>(null);
  const [cancellationReasonCode, setCancellationReasonCode] = useState("");
  const [cancellationNote, setCancellationNote] = useState("");

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
    (item) => item.direction === direction && item.is_manual_selectable !== false,
  );
  const manualIncome = rows
    .filter((row) => row.status === "active" && row.direction === "income")
    .reduce((sum, row) => sum + Number(row.amount), 0);
  const manualExpense = rows
    .filter((row) => row.status === "active" && row.direction === "expense")
    .reduce((sum, row) => sum + Number(row.amount), 0);
  const payableOutstanding = payables
    .filter((payable) => ["open", "pending", "partial"].includes(payable.status))
    .reduce((sum, payable) => sum + Number(payable.outstanding_amount), 0);
  const activePayablePayments = payables
    .flatMap((payable) => payable.payments ?? [])
    .filter((payment) => payment.status === "posted")
    .reduce((sum, payment) => sum + Number(payment.amount), 0);

  const load = useCallback(async () => {
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
      setPayables(payload.payables ?? []);
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
  }, [query]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

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
          paymentStatus,
          dueDate,
          reference,
          evidenceUrl,
          notes,
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
      setReference("");
      setEvidenceUrl("");
      setNotes("");
      setDueDate("");
      setIsMovementModalOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }
  async function cancel() {
    if (!cancelEntryId || !cancellationReasonCode || (cancellationReasonCode === "OTHER" && !cancellationNote.trim())) return;
    setSaving(true);
    const response = await fetch(`/api/admin/finance/${cancelEntryId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reasonCode: cancellationReasonCode, note: cancellationNote }),
    });
    const payload = await response.json();
    if (!response.ok) {
      await Swal.fire({
        icon: "error",
        title: "No se pudo anular",
        text: payload.error,
        confirmButtonColor: "#0f766e",
      });
      setSaving(false);
      return;
    }
    setCancelEntryId(null);
    setCancellationReasonCode("");
    setCancellationNote("");
    setSaving(false);
    await load();
  }
  async function payPayable(payable: Payable) {
    if (payable.status === "paid" || payable.status === "cancelled") return;
    const amountResult = await Swal.fire({ title: "Registrar pago", text: `Saldo pendiente: ${formatMoney(Number(payable.outstanding_amount))}`, input: "number", inputValue: String(payable.outstanding_amount), inputAttributes: { min: "0.01", max: String(payable.outstanding_amount), step: "0.01" }, inputValidator: (value) => Number(value) > 0 && Number(value) <= Number(payable.outstanding_amount) ? undefined : "El monto debe estar entre 0.01 y el saldo pendiente." });
    if (!amountResult.isConfirmed) return;
    const methodResult = await Swal.fire({ title: "Método de pago", input: "select", inputOptions: Object.fromEntries(methods.map((method) => [method.id, method.name])), inputPlaceholder: "Seleccionar método", inputValidator: (value) => value ? undefined : "Selecciona el método utilizado." });
    if (!methodResult.isConfirmed) return;
    const response = await fetch(`/api/admin/finance/payables/${payable.id}/pay`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: Number(amountResult.value), paymentMethodId: methodResult.value, paymentDate: today }) });
    const payload = await response.json();
    if (!response.ok) { await Swal.fire({ icon: "error", title: "No se pudo registrar el pago", text: payload.error ?? "Error inesperado" }); return; }
    await load();
  }
  async function reversePayablePayment(paymentId: string) {
    const reasonResult = await Swal.fire({
      title: "Revertir pago",
      input: "select",
      inputLabel: "Motivo",
      inputOptions: {
        ENTRY_ERROR: "Error de registro",
        DUPLICATE: "Pago duplicado",
        WRONG_PAYMENT_METHOD: "Método incorrecto",
        WRONG_AMOUNT: "Monto incorrecto",
        WRONG_REFERENCE: "Referencia incorrecta",
        OTHER: "Otro",
      },
      inputPlaceholder: "Selecciona el motivo",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Continuar",
      inputValidator: (value) => value ? undefined : "Selecciona el motivo.",
    });
    if (!reasonResult.isConfirmed) return;
    const reasonCode = String(reasonResult.value);
    const noteResult = await Swal.fire({
      title: "Observación",
      input: "textarea",
      inputLabel: reasonCode === "OTHER" ? "Detalle obligatorio" : "Detalle opcional",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Revertir pago",
      inputValidator: (value) => reasonCode === "OTHER" && !value.trim() ? "Describe el motivo." : undefined,
    });
    if (!noteResult.isConfirmed) return;
    const response = await fetch(`/api/admin/finance/payables/payments/${paymentId}/reverse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reasonCode, note: String(noteResult.value ?? "") }),
    });
    const payload = await response.json();
    if (!response.ok) {
      await Swal.fire({ icon: "error", title: "No se pudo revertir el pago", text: payload.error ?? "Error inesperado", confirmButtonColor: "#0f766e" });
      return;
    }
    await load();
  }

  return (
    <div className="space-y-5">
      <OperationOverlay active={saving} label="Procesando operación financiera…" />
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Registro de Costos y Gastos
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Registra cada ingreso o salida con su tipo económico y fecha
              contable.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setIsMovementModalOpen(true)}>
              + Nuevo movimiento
            </Button>
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
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
            Ingresos reconocidos
          </p>
          <strong className="mt-1 block text-xl text-emerald-800">
            {formatMoney(manualIncome)}
          </strong>
        </article>
        <article className="rounded-xl border border-rose-100 bg-rose-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-rose-700">
            Gastos reconocidos
          </p>
          <strong className="mt-1 block text-xl text-rose-800">
            {formatMoney(manualExpense)}
          </strong>
        </article>
        <article className="rounded-xl border border-amber-100 bg-amber-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-amber-700">CxP pendiente</p><strong className="mt-1 block text-xl text-amber-800">{formatMoney(payableOutstanding)}</strong><p className="mt-1 text-xs text-amber-700">Obligaciones aún no canceladas.</p></article>
        <article className="rounded-xl border border-sky-100 bg-sky-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-sky-700">Pagos vigentes</p><strong className="mt-1 block text-xl text-sky-800">{formatMoney(activePayablePayments)}</strong><p className="mt-1 text-xs text-sky-700">Pagos activos de cuentas por pagar.</p></article>
      </section>
      <nav className="flex flex-wrap gap-2 border-b border-slate-200" aria-label="Vistas financieras">
        {[['payments', 'Pagos registrados'], ['payables', 'Pagos pendientes'], ['operations', 'Operaciones registradas']].map(([key, label]) => <button key={key} type="button" onClick={() => setFinanceTab(key as typeof financeTab)} className={`px-3 py-2 text-sm font-semibold ${financeTab === key ? "border-b-2 border-emerald-600 text-emerald-700" : "text-slate-500 hover:text-slate-800"}`}>{label}</button>)}
      </nav>
      {financeTab === "payments" ? <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b p-5"><h3 className="font-semibold text-slate-950">Pagos registrados de cuentas por pagar</h3><p className="mt-1 text-sm text-slate-500">Cada reversa conserva el pago y su motivo; no vuelve a crear gasto.</p></div>
        <div className="divide-y divide-slate-100">
          {payables.flatMap((payable) => (payable.payments ?? []).map((payment) => {
            const method = Array.isArray(payment.payment_method) ? payment.payment_method[0] : payment.payment_method;
            const reversed = payment.status !== "posted";
            return <div key={payment.id} className={`flex flex-wrap items-center justify-between gap-3 p-4 text-sm ${reversed ? "bg-slate-50 text-slate-500" : ""}`}><div><strong>{payable.description}</strong><span className="ml-2 text-slate-500">{asDate(payment.paid_at)} · {method?.name ?? "Sin método"} · {payment.reference || "Sin referencia"}</span>{reversed ? <p className="mt-1 text-xs">Importe original: {formatMoney(Number(payment.amount))} · Estado: REVERTIDO · Efecto vigente: S/ 0.00{payment.reversal_reason ? ` · Motivo: ${payment.reversal_reason}` : ""}</p> : null}</div><div className="flex items-center gap-3"><span className={reversed ? "font-medium text-slate-500" : "font-medium text-emerald-700"}>{reversed ? "Revertido" : `${formatMoney(Number(payment.amount))} · Registrado`}</span>{payment.status === "posted" ? <button type="button" onClick={() => void reversePayablePayment(payment.id)} className="text-xs font-semibold text-rose-700 hover:underline">Revertir pago</button> : null}</div></div>;
          }))}
          {!payables.some((payable) => (payable.payments ?? []).length) ? <p className="p-5 text-sm text-slate-500">No hay pagos registrados en las cuentas por pagar del rango.</p> : null}
        </div>
      </section> : null}
      <Modal
        open={isMovementModalOpen}
        title="Nuevo movimiento"
        description="Registra un costo, gasto u otro ingreso con su fecha contable y soporte."
        onClose={() => setIsMovementModalOpen(false)}
        isDirty={Boolean(categoryId || amount || description || reference || evidenceUrl || notes || dueDate)}
        size="xl"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              onClick={() => setIsMovementModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              disabled={saving || !categoryId || !amount || !description.trim() || (paymentStatus === "paid" && !paymentMethodId)}
              onClick={() => void save()}
            >
              {saving ? "Guardando..." : paymentStatus === "pending" ? "Registrar obligación" : "Registrar operación"}
            </Button>
          </div>
        }
      >
        <h3 className="font-semibold text-slate-950">Registrar movimiento: costo, gasto u otro ingreso</h3>
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
              disabled={paymentStatus === "pending"}
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
          <label className="text-sm font-medium">
            Forma de pago
            <Select className="mt-1" value={paymentStatus} onChange={(event) => { setPaymentStatus(event.target.value as "paid" | "pending"); setPaymentMethodId(""); }}>
              <option value="paid">Pagado</option>
              {direction === "expense" ? <option value="pending">Pendiente / crédito</option> : null}
            </Select>
          </label>
          {paymentStatus === "pending" ? <label className="text-sm font-medium">Vencimiento opcional<Input className="mt-1" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label> : null}
          <label className="text-sm font-medium">Referencia<Input className="mt-1" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Nro. operación, recibo o factura" /></label>
          <label className="text-sm font-medium">Evidencia (URL opcional)<Input className="mt-1" type="url" value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} placeholder="Enlace a comprobante o archivo" /></label>
          <label className="text-sm font-medium md:col-span-3">
            Descripción del movimiento
            <Input
              className="mt-1"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Obligatoria. Ej.: alquiler de agosto, reparación de máquina o detalle de otro concepto."
            />
          </label>
          <label className="text-sm font-medium md:col-span-3">Observación o evidencia<Input className="mt-1" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Dato adicional o ubicación de evidencia" /></label>
        </div>
      </Modal>
      <Modal
        open={Boolean(cancelEntryId)}
        title="Anular operación"
        description="Solo es posible cuando la operación no tiene pagos vigentes. La anulación revierte el efecto económico y conserva el historial."
        onClose={() => { if (!saving) { setCancelEntryId(null); setCancellationReasonCode(""); setCancellationNote(""); } }}
        size="md"
        footer={<div className="flex justify-end gap-2"><Button className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-50" disabled={saving} onClick={() => setCancelEntryId(null)}>Cancelar</Button><Button className="bg-rose-600 hover:bg-rose-700" disabled={saving || !cancellationReasonCode || (cancellationReasonCode === "OTHER" && !cancellationNote.trim())} onClick={() => void cancel()}>{saving ? "Anulando..." : "Anular operación"}</Button></div>}
      >
        <div className="space-y-3">
          <label className="block text-sm font-medium">Motivo de anulación *<Select className="mt-1" value={cancellationReasonCode} onChange={(event) => setCancellationReasonCode(event.target.value)}><option value="">Seleccionar motivo</option><option value="ENTRY_ERROR">Error de registro</option><option value="DUPLICATE">Movimiento duplicado</option><option value="WRONG_AMOUNT">Monto incorrecto</option><option value="WRONG_CATEGORY">Categoría incorrecta</option><option value="WRONG_DATE">Fecha incorrecta</option><option value="WRONG_PAYMENT_METHOD">Método de pago incorrecto</option><option value="SOURCE_DOCUMENT_CANCELLED">Documento/obligación anulada</option><option value="OTHER">Otro</option></Select></label>
          <label className="block text-sm font-medium">Observación{cancellationReasonCode === "OTHER" ? " *" : " (opcional)"}<Input className="mt-1" value={cancellationNote} onChange={(event) => setCancellationNote(event.target.value)} placeholder={cancellationReasonCode === "OTHER" ? "Describe el motivo" : "Detalle adicional"} /></label>
        </div>
      </Modal>
      {financeTab === "payables" ? <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b p-5"><h3 className="font-semibold text-slate-950">Pagos pendientes</h3><p className="mt-1 text-sm text-slate-500">Cada fila es una cuenta por pagar: la obligación, no el pago que la cancela.</p></div>
        <table className="min-w-[760px] w-full text-sm"><thead className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="p-3">Fecha</th><th>Descripción</th><th>Sede</th><th>Vencimiento</th><th>Estado</th><th className="text-right">Saldo</th><th className="p-3 text-right">Acción</th></tr></thead><tbody>{payables.length === 0 ? <tr><td colSpan={7} className="p-6 text-center text-slate-500">No hay obligaciones.</td></tr> : payables.map((payable) => { const branch = Array.isArray(payable.branch) ? payable.branch[0] : payable.branch; const canPay = payable.status === "open" || payable.status === "pending" || payable.status === "partial"; return <tr key={payable.id} className="border-b border-slate-100"><td className="p-3">{asDate(payable.accounting_date)}</td><td>{payable.description}</td><td>{branch?.name ?? "Sin sede"}</td><td>{payable.due_date ? asDate(payable.due_date) : "—"}</td><td>{payableStatusLabel[payable.status]}</td><td className="text-right font-medium">{formatMoney(Number(payable.outstanding_amount))}</td><td className="p-3 text-right">{canPay ? <button type="button" onClick={() => void payPayable(payable)} className="text-xs font-semibold text-emerald-700 hover:underline">Registrar pago</button> : "—"}</td></tr>; })}</tbody></table>
      </section> : null}
      {financeTab === "operations" ? <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b p-5">
          <h3 className="font-semibold text-slate-950">
            Operaciones registradas
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Cada operación representa el ingreso o gasto original. Una cuenta
            por pagar y sus pagos se consultan por separado arriba.
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
                          onClick={() => { setCancelEntryId(row.id); setCancellationReasonCode(""); setCancellationNote(""); }}
                          className="text-xs font-semibold text-rose-700 hover:underline"
                        >
                          Anular operación
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
      </section> : null}
    </div>
  );
}
