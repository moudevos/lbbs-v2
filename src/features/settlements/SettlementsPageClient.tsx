"use client";

import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/features/pos/pos-utils";
import { EmployeeSettlementDocument } from "@/features/settlements/EmployeeSettlementDocument";
import { SettlementReviewModal } from "@/features/settlements/SettlementReviewModal";
import { settlementStatusLabels } from "@/features/settlements/settlement-status";

type Status = "draft" | "review" | "approved" | "paid" | "cancelled";
type Row = Record<string, unknown> & { id: string; status: Status; employee_id: string; branch_id: string; payroll_period_id: string; settlement_number: string; commission_rate: number | string; gross_pay_amount: number | string; debt_deduction_total: number | string; net_pay_amount: number | string };
type Option = Record<string, unknown> & { id: string };
type ReviewDetail = { detail: Record<string, unknown>; services: Array<Record<string, unknown>>; bonuses: Array<Record<string, unknown>>; deductions: Array<Record<string, unknown>>; adjustments: Array<Record<string, unknown>> };
type ReviewAdjustment = { adjustment_type: "bonus" | "deduction"; description: string; amount: string };
type DebtGroup = { debtType: string; debts: Option[]; total: number };

const relation = (value: unknown, key: string) => {
  const item = Array.isArray(value) ? value[0] : value;
  return item && typeof item === "object" ? String((item as Record<string, unknown>)[key] ?? "") : "";
};
const debtLabels: Record<string, string> = {
  loan: "Préstamos",
  advance: "Adelantos",
  supply: "Insumos",
  internal_credit: "Crédito interno",
  penalty: "Penalidades",
  other: "Otros descuentos",
};

export function SettlementsPageClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [periods, setPeriods] = useState<Option[]>([]);
  const [employees, setEmployees] = useState<Option[]>([]);
  const [debts, setDebts] = useState<Option[]>([]);
  const [methods, setMethods] = useState<Option[]>([]);
  const [currentPeriodIds, setCurrentPeriodIds] = useState<string[]>([]);
  const [activeSettlementKeys, setActiveSettlementKeys] = useState<string[]>([]);
  const [businessDate, setBusinessDate] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [paymentRow, setPaymentRow] = useState<Row | null>(null);
  const [documentData, setDocumentData] = useState<{ detail: Record<string, unknown>; services: Array<Record<string, unknown>>; bonuses: Array<Record<string, unknown>>; deductions: Array<Record<string, unknown>> } | null>(null);
  const [reviewData, setReviewData] = useState<ReviewDetail | null>(null);
  const [reviewRow, setReviewRow] = useState<Row | null>(null);
  const [reviewAdjustments, setReviewAdjustments] = useState<ReviewAdjustment[]>([]);
  const [periodId, setPeriodId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [rate, setRate] = useState("");
  const [notes, setNotes] = useState("");
  const [highRateNote, setHighRateNote] = useState("");
  const [debtAmounts, setDebtAmounts] = useState<Record<string, string>>({});
  const [categoryDebtAmounts, setCategoryDebtAmounts] = useState<Record<string, string>>({});
  const [paymentMethodId, setPaymentMethodId] = useState("");

  async function loadData() {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/settlements", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setRows(payload.data ?? []);
      setPeriods(payload.periods ?? []);
      setEmployees(payload.employees ?? []);
      setDebts(payload.debts ?? []);
      setMethods((payload.paymentMethods ?? []).filter((method: Option) => String(method.payment_kind) !== "internal_credit"));
      setCurrentPeriodIds(payload.currentPeriodIds ?? []);
      setActiveSettlementKeys(payload.activeSettlementKeys ?? []);
      setBusinessDate(String(payload.businessDate ?? ""));
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudieron cargar las liquidaciones.";
      console.error("[settlements/ui] Error al cargar", { message });
      await Swal.fire({ icon: "error", title: "No se pudieron cargar las liquidaciones", text: message, confirmButtonColor: "#0f766e" });
    } finally {
      setIsLoading(false);
    }
  }
  useEffect(() => { const timer = window.setTimeout(() => void loadData(), 0); return () => window.clearTimeout(timer); }, []);

  const selectedEmployee = employees.find((employee) => employee.id === employeeId);
  const employeeDebts = useMemo(() => debts.filter((debt) => String(debt.employee_id) === employeeId), [debts, employeeId]);
  const debtGroups = useMemo(() => Object.values(employeeDebts.reduce<Record<string, DebtGroup>>((groups, debt) => {
    const debtType = String(debt.debt_type ?? "other");
    const group = groups[debtType] ?? { debtType, debts: [], total: 0 };
    group.debts.push(debt);
    group.total += Number(debt.outstanding_amount ?? 0);
    groups[debtType] = group;
    return groups;
  }, {})), [employeeDebts]);
  const availableEmployees = useMemo(() => employees.filter((employee) => !periodId || !activeSettlementKeys.includes(`${periodId}:${employee.id}`)), [employees, periodId, activeSettlementKeys]);

  function resetForm() {
    setPeriodId(currentPeriodIds[0] ?? "");
    setEmployeeId(""); setRate(""); setNotes(""); setHighRateNote(""); setDebtAmounts({}); setCategoryDebtAmounts({}); setFormOpen(true);
  }
  function setCategoryDeduction(group: DebtGroup, rawAmount: string) {
    const requested = Math.max(Number(rawAmount) || 0, 0);
    let remaining = requested;
    setCategoryDebtAmounts((current) => ({ ...current, [group.debtType]: rawAmount }));
    setDebtAmounts((current) => {
      const next = { ...current };
      for (const debt of group.debts) {
        const applied = Math.min(remaining, Number(debt.outstanding_amount ?? 0));
        if (applied > 0) next[debt.id] = String(applied);
        else delete next[debt.id];
        remaining -= applied;
      }
      return next;
    });
  }
  function categoryDeduction(group: DebtGroup) { return categoryDebtAmounts[group.debtType] ?? ""; }

  async function prepare() {
    if (!periodId || !employeeId || !rate) return;
    const numericRate = Number(rate);
    if (numericRate > 60) {
      const confirmation = await Swal.fire({ icon: "warning", title: "Porcentaje mayor a 60 %", text: "Este porcentaje requiere autorización y quedará auditado.", showCancelButton: true, confirmButtonText: "Continuar", cancelButtonText: "Cancelar", confirmButtonColor: "#0f766e" });
      if (!confirmation.isConfirmed) return;
    }
    setIsSaving(true);
    try {
      const debtDeductions = Object.entries(debtAmounts).filter(([, amount]) => Number(amount) > 0).map(([debt_id, amount]) => ({ debt_id, amount: Number(amount) }));
      const response = await fetch("/api/admin/settlements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ periodId, employeeId, commissionRate: numericRate, debtDeductions, notes, highRateNote }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error);
      setFormOpen(false); await loadData();
      await Swal.fire({ icon: "success", title: "Liquidación preparada", text: "El borrador y sus snapshots quedaron guardados.", confirmButtonColor: "#0f766e" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo preparar.";
      await Swal.fire({ icon: "error", title: "No se pudo preparar", text: message, confirmButtonColor: "#0f766e" });
    } finally { setIsSaving(false); }
  }
  async function action(row: Row, actionName: "confirm" | "approve" | "cancel") {
    let reason = "";
    if (actionName === "cancel") {
      const result = await Swal.fire({ title: "Anular liquidación", input: "textarea", inputLabel: "Motivo obligatorio", showCancelButton: true, confirmButtonText: "Anular", cancelButtonText: "Cancelar", confirmButtonColor: "#dc2626", inputValidator: (value) => value.trim() ? undefined : "Ingresa el motivo." });
      if (!result.isConfirmed) return; reason = result.value;
    }
    const response = await fetch(`/api/admin/settlements/${row.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: actionName, reason }) });
    const payload = await response.json();
    if (!response.ok) { await Swal.fire({ icon: "error", title: "No se pudo actualizar", text: payload.error, confirmButtonColor: "#0f766e" }); return; }
    await loadData();
  }
  async function openDocument(row: Row) {
    const response = await fetch(`/api/admin/settlements/${row.id}`, { cache: "no-store" }); const payload = await response.json();
    if (!response.ok) { await Swal.fire({ icon: "error", title: "No se pudo abrir el documento", text: payload.error, confirmButtonColor: "#0f766e" }); return; }
    setDocumentData({ detail: payload.data, services: payload.services ?? [], bonuses: payload.bonuses ?? [], deductions: payload.deductions ?? [] });
  }
  async function openReview(row: Row) {
    const response = await fetch(`/api/admin/settlements/${row.id}`, { cache: "no-store" }); const payload = await response.json();
    if (!response.ok) { await Swal.fire({ icon: "error", title: "No se pudo cargar la confirmación", text: payload.error, confirmButtonColor: "#0f766e" }); return; }
    setReviewRow(row); setReviewData({ detail: payload.data, services: payload.services ?? [], bonuses: payload.bonuses ?? [], deductions: payload.deductions ?? [], adjustments: payload.adjustments ?? [] });
    setReviewAdjustments((payload.adjustments ?? []).map((item: Record<string, unknown>) => ({ adjustment_type: item.adjustment_type === "bonus" ? "bonus" : "deduction", description: String(item.description ?? ""), amount: String(item.amount ?? "") })));
  }
  async function confirmReview() {
    if (!reviewRow) return;
    const adjustments = reviewAdjustments.filter((item) => item.description.trim() || item.amount.trim());
    if (adjustments.some((item) => !item.description.trim() || Number(item.amount) <= 0)) { await Swal.fire({ icon: "warning", title: "Ajuste incompleto", text: "Cada ajuste requiere motivo y monto mayor a cero.", confirmButtonColor: "#0f766e" }); return; }
    setIsSaving(true);
    try {
      const response = await fetch(`/api/admin/settlements/${reviewRow.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "confirm", adjustments: adjustments.map((item) => ({ ...item, amount: Number(item.amount) })) }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error);
      setReviewData(null); setReviewRow(null); await loadData();
      await Swal.fire({ icon: "success", title: "Liquidación confirmada", text: "El detalle y los ajustes quedaron auditados. Ya puedes aprobarla.", confirmButtonColor: "#0f766e" });
    } catch (error) { const message = error instanceof Error ? error.message : "No se pudo confirmar la liquidación."; await Swal.fire({ icon: "error", title: "No se pudo confirmar", text: message, confirmButtonColor: "#0f766e" }); } finally { setIsSaving(false); }
  }
  async function pay() {
    if (!paymentRow || !paymentMethodId) return;
    setIsSaving(true);
    try {
      const response = await fetch(`/api/admin/settlements/${paymentRow.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "pay", paymentMethodId, amount: Number(paymentRow.net_pay_amount) }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error);
      setPaymentRow(null); setPaymentMethodId(""); await loadData();
      await Swal.fire({ icon: "success", title: "Pago registrado", text: "La liquidación quedó pagada y el comprobante ya está disponible.", confirmButtonColor: "#0f766e" });
    } catch (error) { const message = error instanceof Error ? error.message : "No se pudo pagar."; await Swal.fire({ icon: "error", title: "No se pudo registrar el pago", text: message, confirmButtonColor: "#0f766e" }); } finally { setIsSaving(false); }
  }
  function downloadDocument() {
    if (!documentData) return;
    const id = String(documentData.detail.id ?? "");
    const anchor = document.createElement("a"); anchor.href = `/api/admin/settlements/${id}/document`; anchor.download = ""; anchor.click();
  }

  return <div className="space-y-4">
    <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-slate-900">Liquidaciones quincenales</p><p className="mt-1 text-sm text-slate-600">Borrador, confirmación, aprobación, pago y comprobante descargable.</p></div><Button type="button" onClick={resetForm}>Nueva liquidación</Button></section>
    <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><table className="min-w-[940px] w-full text-sm"><thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2.5">Número</th><th className="px-3 py-2.5">Empleado</th><th className="px-3 py-2.5">Periodo</th><th className="px-3 py-2.5">Estado</th><th className="px-3 py-2.5 text-center">%</th><th className="px-3 py-2.5 text-center">Bruto</th><th className="px-3 py-2.5 text-center">Deudas</th><th className="px-3 py-2.5 text-center">Neto</th><th className="px-3 py-2.5 text-right">Acciones</th></tr></thead><tbody className="divide-y divide-slate-100">{isLoading ? <tr><td colSpan={9} className="py-8 text-center text-slate-500">Cargando liquidaciones...</td></tr> : rows.map((row) => { const style: Record<Status, string> = { draft: "bg-slate-100 text-slate-600", review: "bg-amber-50 text-amber-700", approved: "bg-sky-50 text-sky-700", paid: "bg-emerald-50 text-emerald-700", cancelled: "bg-rose-50 text-rose-700" }; const canCancel = ["draft", "review", "approved"].includes(row.status); return <tr key={row.id} className="transition hover:bg-slate-50"><td className="px-3 py-2.5 font-medium">{row.settlement_number}</td><td className="px-3 py-2.5">{relation(row.employee, "full_name")}</td><td className="px-3 py-2.5 text-xs text-slate-500">{relation(row.period, "start_date")} al {relation(row.period, "end_date")}</td><td className="px-3 py-2.5"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style[row.status]}`}>{settlementStatusLabels[row.status]}</span></td><td className="px-3 py-2.5 text-center">{Number(row.commission_rate).toFixed(2)} %</td><td className="px-3 py-2.5 text-center">{formatMoney(Number(row.gross_pay_amount))}</td><td className="px-3 py-2.5 text-center">{formatMoney(Number(row.debt_deduction_total))}</td><td className="px-3 py-2.5 text-center font-semibold">{formatMoney(Number(row.net_pay_amount))}</td><td className="px-3 py-2.5"><div className="flex flex-wrap justify-end gap-1.5">{row.status === "draft" ? <Button type="button" className="h-8 px-2.5 text-xs" onClick={() => void openReview(row)}>Confirmar</Button> : null}{row.status === "review" ? <Button type="button" className="h-8 px-2.5 text-xs" onClick={() => void action(row, "approve")}>Aprobar</Button> : null}{row.status === "approved" ? <Button type="button" className="h-8 px-2.5 text-xs" onClick={() => { setPaymentRow(row); setPaymentMethodId(""); }}>Pagar</Button> : null}<Button type="button" className="h-8 border border-slate-200 bg-white px-2.5 text-xs text-slate-700" onClick={() => void openDocument(row)}>{row.status === "paid" ? "Comprobante" : "Documento"}</Button>{canCancel ? <Button type="button" className="h-8 bg-rose-100 px-2.5 text-xs text-rose-700 hover:bg-rose-200" onClick={() => void action(row, "cancel")}>Anular</Button> : null}</div></td></tr>; })}</tbody></table></section>
    <Modal open={formOpen} title="Preparar liquidación" description="El porcentaje, producción y descuentos quedan como snapshot de esta quincena." onClose={() => setFormOpen(false)} isDirty={Boolean(periodId || employeeId || rate)} size="lg" footer={<div className="flex justify-end gap-2"><Button type="button" className="bg-white text-slate-700" onClick={() => setFormOpen(false)}>Cancelar</Button><Button type="button" disabled={isSaving || !periodId || !employeeId || !rate} onClick={() => void prepare()}>{isSaving ? "Guardando..." : "Guardar borrador"}</Button></div>}><div className="space-y-4"><div className="rounded-lg border border-sky-100 bg-sky-50 p-3 text-sm text-sky-900"><strong>Plazo vigente:</strong> fecha operativa {businessDate || "-"}. Se muestra el periodo actual y, durante dos días posteriores al cierre, el periodo quincenal recién terminado.</div><div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm">Periodo<Select value={periodId} onChange={(e) => { setPeriodId(e.target.value); setEmployeeId(""); }}><option value="">Seleccionar periodo</option>{periods.map((p) => <option key={p.id} value={p.id}>{currentPeriodIds.includes(p.id) ? "Vigente - " : "Histórico - "}{String(p.start_date)} al {String(p.end_date)}</option>)}</Select></label><label className="space-y-1 text-sm">Empleado<Select value={employeeId} onChange={(e) => { setEmployeeId(e.target.value); setDebtAmounts({}); }}><option value="">Seleccionar empleado</option>{availableEmployees.map((e) => <option key={e.id} value={e.id}>{String(e.full_name)}</option>)}</Select>{periodId && !availableEmployees.length ? <p className="text-xs text-amber-700">Todos los empleados ya tienen una liquidación activa para este periodo.</p> : null}</label><label className="space-y-1 text-sm">Porcentaje de comisión<Input type="number" min="0" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="50" /></label></div>{Number(rate) > 60 ? <label className="block space-y-1 text-sm">Observación de autorización<Textarea value={highRateNote} onChange={(e) => setHighRateNote(e.target.value)} placeholder="Motivo y autorización del porcentaje excepcional" /></label> : null}{debtGroups.length ? <section className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-sm font-medium">Deuda total de {String(selectedEmployee?.full_name ?? "empleado")}</p><p className="mt-1 text-xs text-slate-500">Agrupada por categoría. Al indicar un descuento, se distribuye automáticamente desde la deuda más antigua de esa categoría.</p><div className="mt-3 space-y-2">{debtGroups.map((group) => <label key={group.debtType} className="grid grid-cols-[1fr_130px] items-center gap-3 rounded-lg bg-white p-3 text-sm"><span><strong>{debtLabels[group.debtType] ?? group.debtType}</strong><br /><span className="text-slate-500">Saldo total: {formatMoney(group.total)}</span></span><Input type="number" min="0" max={group.total} step="0.01" value={categoryDeduction(group) || ""} onChange={(e) => setCategoryDeduction(group, e.target.value)} placeholder="Descontar" /></label>)}</div></section> : employeeId ? <p className="text-sm text-slate-500">El empleado no tiene deudas vigentes.</p> : null}<label className="block space-y-1 text-sm">Notas<Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></label></div></Modal>
    <Modal open={paymentRow !== null} title="Registrar pago" description={paymentRow ? `Neto a pagar: ${formatMoney(Number(paymentRow.net_pay_amount))}. La fecha se registra automáticamente con la fecha operativa.` : ""} onClose={() => setPaymentRow(null)} isDirty={Boolean(paymentMethodId)} size="md" footer={<div className="flex justify-end gap-2"><Button type="button" className="bg-white text-slate-700" onClick={() => setPaymentRow(null)}>Cancelar</Button><Button type="button" disabled={isSaving || !paymentMethodId} onClick={() => void pay()}>{isSaving ? "Pagando..." : "Guardar pago"}</Button></div>}><label className="block space-y-1 text-sm">Método de pago<Select value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)}><option value="">Seleccionar método</option>{methods.map((m) => <option key={m.id} value={m.id}>{String(m.name)}</option>)}</Select></label></Modal>
    <SettlementReviewModal data={reviewData} adjustments={reviewAdjustments} isSaving={isSaving} onChange={setReviewAdjustments} onClose={() => { setReviewData(null); setReviewRow(null); }} onConfirm={() => void confirmReview()} />
    <Modal open={documentData !== null} title={documentData?.detail.status === "paid" ? "Comprobante de pago" : "Documento de liquidación"} onClose={() => setDocumentData(null)} confirmBeforeClose={false} size="xl">{documentData ? <EmployeeSettlementDocument {...documentData} onClose={() => setDocumentData(null)} onDownload={downloadDocument} /> : null}</Modal>
  </div>;
}
