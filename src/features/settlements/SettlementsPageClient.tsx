"use client";

import { useEffect, useState } from "react";
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

type Row = Record<string, unknown> & { id: string; status: "draft" | "review" | "approved" | "paid" | "cancelled"; employee_id: string; branch_id: string; settlement_number: string; commission_rate: number | string; gross_pay_amount: number | string; debt_deduction_total: number | string; mandatory_discount_amount?: number | string; net_pay_amount: number | string };
type Option = Record<string, unknown> & { id: string };
type ReviewDetail = { detail: Record<string, unknown>; services: Array<Record<string, unknown>>; bonuses: Array<Record<string, unknown>>; deductions: Array<Record<string, unknown>>; adjustments: Array<Record<string, unknown>> };
type ReviewAdjustment = { adjustment_type: "bonus" | "deduction"; description: string; amount: string };
const relation = (value: unknown, key: string) => { const item = Array.isArray(value) ? value[0] : value; return item && typeof item === "object" ? String((item as Record<string, unknown>)[key] ?? "") : ""; };

export function SettlementsPageClient() {
  const [rows, setRows] = useState<Row[]>([]); const [periods, setPeriods] = useState<Option[]>([]); const [employees, setEmployees] = useState<Option[]>([]); const [debts, setDebts] = useState<Option[]>([]); const [methods, setMethods] = useState<Option[]>([]); const [sessions, setSessions] = useState<Option[]>([]);
  const [isLoading, setIsLoading] = useState(true); const [isSaving, setIsSaving] = useState(false); const [formOpen, setFormOpen] = useState(false); const [paymentRow, setPaymentRow] = useState<Row | null>(null); const [documentData, setDocumentData] = useState<{ detail: Record<string, unknown>; services: Array<Record<string, unknown>>; bonuses: Array<Record<string, unknown>>; deductions: Array<Record<string, unknown>> } | null>(null); const [reviewData, setReviewData] = useState<ReviewDetail | null>(null); const [reviewRow, setReviewRow] = useState<Row | null>(null); const [reviewAdjustments, setReviewAdjustments] = useState<ReviewAdjustment[]>([]);
  const [periodId, setPeriodId] = useState(""); const [employeeId, setEmployeeId] = useState(""); const [rate, setRate] = useState(""); const [notes, setNotes] = useState(""); const [highRateNote, setHighRateNote] = useState(""); const [debtAmounts, setDebtAmounts] = useState<Record<string, string>>({});
  const [paymentMethodId, setPaymentMethodId] = useState(""); const [paymentReference, setPaymentReference] = useState(""); const [paymentEvidence, setPaymentEvidence] = useState(""); const [posSessionId, setPosSessionId] = useState("");

  async function loadData() { setIsLoading(true); try { const response = await fetch("/api/admin/settlements", { cache: "no-store" }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error); setRows(payload.data ?? []); setPeriods(payload.periods ?? []); setEmployees(payload.employees ?? []); setDebts(payload.debts ?? []); setMethods(payload.paymentMethods ?? []); setSessions(payload.openSessions ?? []); } catch (error) { const message = error instanceof Error ? error.message : "No se pudieron cargar las liquidaciones."; console.error("[settlements/ui] Error al cargar", { message }); await Swal.fire({ icon: "error", title: "No se pudieron cargar las liquidaciones", text: message, confirmButtonColor: "#0f766e" }); } finally { setIsLoading(false); } }
  useEffect(() => { const timer = window.setTimeout(() => void loadData(), 0); return () => window.clearTimeout(timer); }, []);

  async function prepare() { if (!periodId || !employeeId || !rate) return; const numericRate = Number(rate); if (numericRate > 60) { const confirmation = await Swal.fire({ icon: "warning", title: "Porcentaje mayor a 60 %", text: "Este porcentaje requiere autorizacion y quedara auditado.", showCancelButton: true, confirmButtonText: "Continuar", cancelButtonText: "Cancelar", confirmButtonColor: "#0f766e" }); if (!confirmation.isConfirmed) return; } setIsSaving(true); try { const debtDeductions = Object.entries(debtAmounts).filter(([, amount]) => Number(amount) > 0).map(([debt_id, amount]) => ({ debt_id, amount: Number(amount) })); const response = await fetch("/api/admin/settlements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ periodId, employeeId, commissionRate: numericRate, debtDeductions, notes, highRateNote }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error); setFormOpen(false); await loadData(); await Swal.fire({ icon: "success", title: "Liquidacion preparada", text: "El borrador y sus snapshots quedaron guardados.", confirmButtonColor: "#0f766e" }); } catch (error) { const message = error instanceof Error ? error.message : "No se pudo preparar."; console.error("[settlements/ui] Error al preparar", { message }); await Swal.fire({ icon: "error", title: "No se pudo preparar", text: message, confirmButtonColor: "#0f766e" }); } finally { setIsSaving(false); } }

  async function action(row: Row, actionName: "review" | "approve" | "cancel") { let reason = ""; if (actionName === "cancel") { const result = await Swal.fire({ title: "Anular liquidacion", input: "textarea", inputLabel: "Motivo obligatorio", showCancelButton: true, confirmButtonText: "Anular", cancelButtonText: "Cancelar", confirmButtonColor: "#dc2626", inputValidator: (value) => value.trim() ? undefined : "Ingresa el motivo." }); if (!result.isConfirmed) return; reason = result.value; } const response = await fetch(`/api/admin/settlements/${row.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: actionName, reason }) }); const payload = await response.json(); if (!response.ok) { await Swal.fire({ icon: "error", title: "No se pudo actualizar", text: payload.error, confirmButtonColor: "#0f766e" }); return; } await loadData(); }
  async function openDocument(row: Row) { const response = await fetch(`/api/admin/settlements/${row.id}`, { cache: "no-store" }); const payload = await response.json(); if (!response.ok) { await Swal.fire({ icon: "error", title: "No se pudo abrir el documento", text: payload.error, confirmButtonColor: "#0f766e" }); return; } setDocumentData({ detail: payload.data, services: payload.services ?? [], bonuses: payload.bonuses ?? [], deductions: payload.deductions ?? [] }); }
  async function openReview(row: Row) { const response = await fetch(`/api/admin/settlements/${row.id}`, { cache: "no-store" }); const payload = await response.json(); if (!response.ok) { await Swal.fire({ icon: "error", title: "No se pudo cargar la revisión", text: payload.error, confirmButtonColor: "#0f766e" }); return; } setReviewRow(row); setReviewData({ detail: payload.data, services: payload.services ?? [], bonuses: payload.bonuses ?? [], deductions: payload.deductions ?? [], adjustments: payload.adjustments ?? [] }); setReviewAdjustments((payload.adjustments ?? []).map((item: Record<string, unknown>) => ({ adjustment_type: item.adjustment_type === "bonus" ? "bonus" : "deduction", description: String(item.description ?? ""), amount: String(item.amount ?? "") }))); }
  async function confirmReview() { if (!reviewRow) return; const adjustments = reviewAdjustments.filter((item) => item.description.trim() || item.amount.trim()); if (adjustments.some((item) => !item.description.trim() || Number(item.amount) <= 0)) { await Swal.fire({ icon: "warning", title: "Ajuste incompleto", text: "Cada ajuste requiere motivo y monto mayor a cero.", confirmButtonColor: "#0f766e" }); return; } setIsSaving(true); try { const response = await fetch(`/api/admin/settlements/${reviewRow.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "review", adjustments: adjustments.map((item) => ({ ...item, amount: Number(item.amount) })) }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error); setReviewData(null); setReviewRow(null); await loadData(); await Swal.fire({ icon: "success", title: "Liquidación revisada", text: "El detalle y los ajustes quedaron auditados. Ya puedes aprobarla.", confirmButtonColor: "#0f766e" }); } catch (error) { const message = error instanceof Error ? error.message : "No se pudo revisar la liquidación."; console.error("[settlements/review] Error al revisar", { message }); await Swal.fire({ icon: "error", title: "No se pudo revisar", text: message, confirmButtonColor: "#0f766e" }); } finally { setIsSaving(false); } }
  async function pay() { if (!paymentRow || !paymentMethodId) return; setIsSaving(true); try { const response = await fetch(`/api/admin/settlements/${paymentRow.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "pay", paymentMethodId, amount: Number(paymentRow.net_pay_amount), reference: paymentReference, evidencePath: paymentEvidence, posSessionId: posSessionId || null }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error); setPaymentRow(null); await loadData(); await Swal.fire({ icon: "success", title: "Pago registrado", text: "La liquidacion quedo pagada y auditada.", confirmButtonColor: "#0f766e" }); } catch (error) { const message = error instanceof Error ? error.message : "No se pudo pagar."; await Swal.fire({ icon: "error", title: "No se pudo registrar el pago", text: message, confirmButtonColor: "#0f766e" }); } finally { setIsSaving(false); } }

  const employeeDebts = debts.filter((debt) => String(debt.employee_id) === employeeId); const selectedMethod = methods.find((method) => method.id === paymentMethodId); const selectedEmployee = employees.find((employee) => employee.id === employeeId);
  return <div className="space-y-4"><section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-slate-900">Liquidaciones quincenales</p><p className="mt-1 text-sm text-slate-600">Preparacion, revision, aprobacion y pago con snapshots.</p></div><Button type="button" onClick={() => { setPeriodId(""); setEmployeeId(""); setRate(""); setNotes(""); setHighRateNote(""); setDebtAmounts({}); setFormOpen(true); }}>Nueva liquidacion</Button></section>
    <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <table className="min-w-[900px] w-full text-sm">
        <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2.5 font-semibold">Numero</th>
            <th className="px-3 py-2.5 font-semibold">Empleado</th>
            <th className="px-3 py-2.5 font-semibold">Periodo</th>
            <th className="px-3 py-2.5 font-semibold">Estado</th>
            <th className="px-3 py-2.5 text-center font-semibold">%</th>
            <th className="px-3 py-2.5 text-center font-semibold">Bruto</th>
            <th className="px-3 py-2.5 text-center font-semibold">Deudas</th>
            <th className="px-3 py-2.5 text-center font-semibold">Neto</th>
            <th className="px-3 py-2.5 text-right font-semibold">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {isLoading ? (
            <tr>
              <td colSpan={9} className="py-8 text-center text-slate-500">
                Cargando liquidaciones...
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const statusStyles: Record<string, { badge: string; dot: string }> = {
                draft: { badge: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
                review: { badge: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
                approved: { badge: "bg-sky-50 text-sky-700", dot: "bg-sky-500" },
                paid: { badge: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
                cancelled: { badge: "bg-rose-50 text-rose-700", dot: "bg-rose-500" },
              };
              const style = statusStyles[row.status] ?? statusStyles.draft;

              return (
                <tr key={row.id} className="transition hover:bg-slate-50">
                  <td className="px-3 py-2.5 font-medium text-slate-900">
                    {row.settlement_number}
                  </td>
                  <td className="px-3 py-2.5 text-slate-700">
                    {relation(row.employee, "full_name")}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">
                    {relation(row.period, "start_date")} al {relation(row.period, "end_date")}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${style.badge}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                      {settlementStatusLabels[row.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center tabular-nums text-slate-700">
                    {Number(row.commission_rate).toFixed(2)} %
                  </td>
                  <td className="px-3 py-2.5 text-center tabular-nums text-slate-700">
                    {formatMoney(Number(row.gross_pay_amount))}
                  </td>
                  <td className="px-3 py-2.5 text-center tabular-nums text-slate-700">
                    {formatMoney(Number(row.debt_deduction_total))}
                  </td>
                  <td className="px-3 py-2.5 text-center tabular-nums font-semibold text-slate-900">
                    {formatMoney(Number(row.net_pay_amount))}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {row.status === "draft" ? (
                        <Button
                          type="button"
                          className="h-8 px-2.5 text-xs"
                          onClick={() => void openReview(row)}
                        >
                          Revisar
                        </Button>
                      ) : null}
                      {row.status === "review" ? (
                        <Button
                          type="button"
                          className="h-8 px-2.5 text-xs"
                          onClick={() => void action(row, "approve")}
                        >
                          Aprobar
                        </Button>
                      ) : null}
                      {row.status === "approved" ? (
                        <Button
                          type="button"
                          className="h-8 px-2.5 text-xs"
                          onClick={() => setPaymentRow(row)}
                        >
                          Pagar
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        className="h-8 border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-amber-200 hover:bg-amber-50 hover:text-amber-800"
                        onClick={() => void openDocument(row)}
                      >
                        Documento
                      </Button>
                      {row.status !== "cancelled" ? (
                        <Button
                          type="button"
                          className="h-8 bg-rose-100 px-2.5 text-xs text-rose-700 hover:bg-rose-200"
                          onClick={() => void action(row, "cancel")}
                        >
                          Anular
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </section>
    <Modal open={formOpen} title="Preparar liquidacion" description="El porcentaje queda como snapshot de esta quincena." onClose={() => setFormOpen(false)} isDirty={Boolean(periodId || employeeId || rate)} size="lg" footer={<div className="flex justify-end gap-2"><Button type="button" className="bg-white text-slate-700" onClick={() => setFormOpen(false)}>Cancelar</Button><Button type="button" disabled={isSaving} onClick={() => void prepare()}>{isSaving ? "Guardando..." : "Guardar borrador"}</Button></div>}><div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm">Periodo<Select value={periodId} onChange={(e) => setPeriodId(e.target.value)}><option value="">Seleccionar periodo</option>{periods.map((p) => <option key={p.id} value={p.id}>{String(p.start_date)} al {String(p.end_date)}</option>)}</Select></label><label className="space-y-1 text-sm">Empleado<Select value={employeeId} onChange={(e) => { setEmployeeId(e.target.value); setDebtAmounts({}); }}><option value="">Seleccionar empleado</option>{employees.map((e) => <option key={e.id} value={e.id}>{String(e.full_name)}</option>)}</Select></label><label className="space-y-1 text-sm">Porcentaje<Input type="number" min="0" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="50" /></label></div>{Number(rate) > 60 ? <label className="block space-y-1 text-sm">Observacion de autorizacion<Textarea value={highRateNote} onChange={(e) => setHighRateNote(e.target.value)} placeholder="Motivo y autorizacion del porcentaje excepcional" /></label> : null}{employeeDebts.length ? <section><p className="text-sm font-medium">Deudas vigentes de {String(selectedEmployee?.full_name ?? "empleado")}</p><p className="mt-1 text-xs text-slate-500">Son saldos acumulados de todas las quincenas; puedes descontar solo la parte que corresponda en esta liquidación.</p><div className="mt-2 space-y-2">{employeeDebts.map((debt) => <label key={debt.id} className="grid grid-cols-[1fr_120px] items-center gap-3 text-sm"><span>{String(debt.description)} · Saldo {formatMoney(Number(debt.outstanding_amount))}</span><Input type="number" min="0" max={Number(debt.outstanding_amount)} step="0.01" value={debtAmounts[debt.id] ?? ""} onChange={(e) => setDebtAmounts((current) => ({ ...current, [debt.id]: e.target.value }))} placeholder="Descontar" /></label>)}</div></section> : null}<label className="block space-y-1 text-sm">Notas<Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></label></div></Modal>
    <Modal open={paymentRow !== null} title="Registrar pago" description={paymentRow ? `Neto: ${formatMoney(Number(paymentRow.net_pay_amount))}` : ""} onClose={() => setPaymentRow(null)} isDirty={Boolean(paymentMethodId || paymentReference || paymentEvidence)} size="md" footer={<div className="flex justify-end gap-2"><Button type="button" className="bg-white text-slate-700" onClick={() => setPaymentRow(null)}>Cancelar</Button><Button type="button" disabled={isSaving || !paymentMethodId} onClick={() => void pay()}>{isSaving ? "Pagando..." : "Registrar pago"}</Button></div>}><div className="space-y-3"><label className="block space-y-1 text-sm">Metodo<Select value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)}><option value="">Seleccionar metodo</option>{methods.map((m) => <option key={m.id} value={m.id}>{String(m.name)}</option>)}</Select></label>{String(selectedMethod?.code) === "cash" ? <label className="block space-y-1 text-sm">Sesion POS<Select value={posSessionId} onChange={(e) => setPosSessionId(e.target.value)}><option value="">Seleccionar sesion activa</option>{sessions.filter((s) => String(s.branch_id) === paymentRow?.branch_id).map((s) => <option key={s.id} value={s.id}>{String(s.business_date)}</option>)}</Select></label> : null}<label className="block space-y-1 text-sm">Referencia<Input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} /></label><label className="block space-y-1 text-sm">Ruta de evidencia opcional<Input value={paymentEvidence} onChange={(e) => setPaymentEvidence(e.target.value)} placeholder="Storage privado" /></label></div></Modal>
    <SettlementReviewModal data={reviewData} adjustments={reviewAdjustments} isSaving={isSaving} onChange={setReviewAdjustments} onClose={() => { setReviewData(null); setReviewRow(null); }} onConfirm={() => void confirmReview()} />
    <Modal open={documentData !== null} title="Documento de liquidacion" onClose={() => setDocumentData(null)} confirmBeforeClose={false} size="xl">{documentData ? <EmployeeSettlementDocument {...documentData} onClose={() => setDocumentData(null)} /> : null}</Modal></div>;
}
