"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/Modal";
import { OperationOverlay } from "@/components/ui/OperationOverlay";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SettlementDebtSelection, type SettlementDebt } from "@/features/settlements/SettlementDebtSelection";
import { buildSettlementFinancialSummary } from "@/features/settlements/settlement-document-summary";
import { buildSettlementDraftPreview, getSettlementDebtMaximum } from "@/features/settlements/settlement-draft-preview";
import { groupSettlementProductionBySale } from "@/features/settlements/settlement-production-grouping";
import { getSettlementStatusLabel } from "@/features/settlements/settlement-status";
import { formatMoney } from "@/features/pos/pos-utils";
import { readFunctionalError, type ClientFunctionalError } from "@/lib/errors/client-functional-error";

type Status = "draft" | "review" | "approved" | "paid" | "cancelled";
type Detail = Record<string, unknown> & { status: Status; net_pay_amount: number | string; commission_rate: number | string; employee_id: string; branch_id: string };
type PaymentPart = { paymentMethodId: string; amount: string; reference: string };
type Payload = { data: Detail; services: Array<Record<string, unknown>>; bonuses: Array<Record<string, unknown>>; productLines: Array<Record<string, unknown>>; deductions: Array<Record<string, unknown>>; payments: Array<Record<string, unknown>> };
type Method = { id: string; name: string; payment_kind?: string };
const numeric = (value: unknown) => Number(value ?? 0) || 0;
const cents = (value: number) => Math.round(value * 100) / 100;
const relation = (value: unknown, key: string) => { const item = Array.isArray(value) ? value[0] : value; return item && typeof item === "object" ? String((item as Record<string, unknown>)[key] ?? "—") : "—"; };
const errorText = (error: unknown) => { const value = error as ClientFunctionalError; return value?.error ?? (error instanceof Error ? error.message : "Error inesperado"); };
const titleFor = (action: "confirm" | "approve" | "cancel" | "pay") => ({ confirm: "No se pudo confirmar la liquidación", approve: "No se pudo finalizar la confirmación", cancel: "No se pudo anular la liquidación", pay: "No se pudo registrar el pago" })[action];

export function SettlementDetailPageClient({ settlementId }: { settlementId: string }) {
  const [payload, setPayload] = useState<Payload | null>(null); const [methods, setMethods] = useState<Method[]>([]);
  const [debts, setDebts] = useState<SettlementDebt[]>([]); const [debtAmounts, setDebtAmounts] = useState<Record<string, string>>({}); const [debtTotals, setDebtTotals] = useState<Record<string, boolean>>({});
  const [rate, setRate] = useState(""); const [highRateNote, setHighRateNote] = useState(""); const [loading, setLoading] = useState(true); const [working, setWorking] = useState(false); const [saveState, setSaveState] = useState<"saved" | "unsaved" | "saving" | "error">("saved");
  const [showDocument, setShowDocument] = useState(false); const [pdfUrl, setPdfUrl] = useState<string | null>(null); const [pdfLoading, setPdfLoading] = useState(false); const [showPayment, setShowPayment] = useState(false); const [isPaying, setIsPaying] = useState(false); const [showCancel, setShowCancel] = useState(false);
  const [paymentParts, setPaymentParts] = useState<PaymentPart[]>([{ paymentMethodId: "", amount: "", reference: "" }]); const [cancelReason, setCancelReason] = useState(""); const [cancelNote, setCancelNote] = useState("");
  const paymentRequestInFlight = useRef(false);
  const load = useCallback(async () => {
    const [detailResponse, rootResponse] = await Promise.all([fetch(`/api/admin/settlements/${settlementId}`, { cache: "no-store" }), fetch("/api/admin/settlements", { cache: "no-store" })]);
    const detail = await readFunctionalError(detailResponse); const root = await readFunctionalError(rootResponse);
    if (!detailResponse.ok) throw detail; if (!rootResponse.ok) throw root;
    const next = detail as Payload; const rootData = root as { paymentMethods?: Method[] }; setPayload(next); setMethods((rootData.paymentMethods ?? []).filter((method) => method.payment_kind !== "internal_credit")); setRate(String(next.data.commission_rate ?? "")); setHighRateNote(String(next.data.high_rate_authorization_note ?? ""));
    if (next.data.status !== "draft") { setDebts([]); return; }
    const response = await fetch(`/api/admin/employee-debts/settlement-options?${new URLSearchParams({ employeeId: next.data.employee_id, branchId: next.data.branch_id })}`, { cache: "no-store" }); const options = await readFunctionalError(response); if (!response.ok) throw options;
    const existing = Object.fromEntries(next.deductions.map((deduction) => [String(deduction.employee_debt_id), String(deduction.amount)])); const optionData = options as { data?: SettlementDebt[] }; setDebtAmounts(existing); setDebtTotals({}); setDebts((optionData.data ?? []).map((debt) => ({ ...debt, available_debt_amount: cents(numeric(debt.available_debt_amount) + numeric(existing[debt.debt_id])) })));
  }, [settlementId]);
  useEffect(() => { let live = true; const timer = window.setTimeout(() => { void load().catch((error) => { if (live) void Swal.fire({ icon: "error", title: "No se pudo cargar la liquidación", text: errorText(error) }); }).finally(() => { if (live) setLoading(false); }); }, 0); return () => { live = false; window.clearTimeout(timer); }; }, [load]);
  useEffect(() => {
    if (!showDocument) return;
    let objectUrl: string | null = null;
    let live = true;
    const timer = window.setTimeout(() => {
      setPdfLoading(true); setPdfUrl(null); void (async () => {
        try {
          const response = await fetch(`/api/admin/settlements/${settlementId}/document?mode=inline`, { credentials: "include", cache: "no-store" });
          const contentType = response.headers.get("content-type") ?? "";
          if (!response.ok || !contentType.includes("application/pdf")) {
            const body = await response.json().catch(() => ({})) as ClientFunctionalError;
            throw new Error(body.error ?? "No se pudo generar el documento PDF.");
          }
          objectUrl = URL.createObjectURL(await response.blob());
          if (live) setPdfUrl(objectUrl);
        } catch (error) {
          console.error("[settlement/pdf]", error);
          if (live) void Swal.fire({ icon: "error", title: "Error al cargar documento", text: errorText(error) });
        } finally { if (live) setPdfLoading(false); }
      })();
    }, 0);
    return () => { live = false; window.clearTimeout(timer); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [settlementId, showDocument]);
  const summary = useMemo(() => payload ? buildSettlementFinancialSummary(payload.data, payload.services, payload.deductions, payload.productLines) : null, [payload]);
  const percentageCommission = useMemo(() => cents((summary?.serviceLines ?? []).filter((line) => line.isPercentageCommission).reduce((total, line) => total + line.commissionBase * numeric(rate) / 100, 0)), [rate, summary]);
  const draftFinancialPreview = useMemo(() => buildSettlementDraftPreview({
    percentageCommission,
    fixedCommissions: numeric(payload?.data.reward_fixed_commission_total) + numeric(payload?.data.courtesy_fixed_commission_total) + numeric(payload?.data.fixed_compensation_total),
    productBonuses: numeric(payload?.data.product_bonus_total),
    manualBonuses: numeric(payload?.data.manual_bonus_total),
    mandatoryDiscount: numeric(payload?.data.mandatory_discount_amount),
    otherDeductions: numeric(payload?.data.other_deduction_total),
    selectedDebtAmounts: Object.values(debtAmounts).map(numeric),
    totalOutstandingDebt: debts.reduce((total, debt) => total + numeric(debt.outstanding_amount), 0),
  }), [debtAmounts, payload, percentageCommission]);
  const debtMaximums = useMemo(() => Object.fromEntries(debts.map((debt) => [debt.debt_id, getSettlementDebtMaximum(numeric(debt.available_debt_amount), draftFinancialPreview.netBeforeDebt, draftFinancialPreview.selectedDebtTotal, numeric(debtAmounts[debt.debt_id]))])), [debtAmounts, debts, draftFinancialPreview.netBeforeDebt, draftFinancialPreview.selectedDebtTotal]);
  const debtInvalid = useMemo(() => draftFinancialPreview.selectedDebtTotal > draftFinancialPreview.netBeforeDebt || debts.some((debt) => numeric(debtAmounts[debt.debt_id]) > numeric(debtMaximums[debt.debt_id])), [debtAmounts, debtMaximums, debts, draftFinancialPreview.netBeforeDebt, draftFinancialPreview.selectedDebtTotal]);
  const selectedDebts = useMemo(() => debts.map((debt) => ({ debt, amount: cents(numeric(debtAmounts[debt.debt_id])) })).filter(({ amount }) => amount > 0), [debtAmounts, debts]);
  const methodsById = useMemo(() => new Map(methods.map((method) => [method.id, method])), [methods]);
  const paymentInvalid = useMemo(() => { const selected = new Set<string>(); return paymentParts.some((part) => { const method = methodsById.get(part.paymentMethodId); const needsReference = method?.payment_kind === "wallet_qr" || method?.payment_kind === "bank_transfer"; const duplicate = Boolean(part.paymentMethodId && selected.has(part.paymentMethodId)); if (part.paymentMethodId) selected.add(part.paymentMethodId); return !part.paymentMethodId || numeric(part.amount) <= 0 || duplicate || (needsReference && !part.reference.trim()); }); }, [methodsById, paymentParts]);
  const saleGroups = useMemo(() => summary ? groupSettlementProductionBySale(summary.serviceLines, summary.productLines) : [], [summary]);
  const productionDetailTotals = useMemo(() => saleGroups.reduce((total, sale) => ({ recognized: total.recognized + sale.recognized, contribution: total.contribution + sale.contribution, commissionBase: total.commissionBase + sale.commissionBase }), { recognized: 0, contribution: 0, commissionBase: 0 }), [saleGroups]);
  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || !summary) return;
    const differs = (left: number, right: number) => Math.abs(left - right) > 0.01;
    if (summary.totalProduction > 0.01 && saleGroups.length === 0) console.warn("[settlements/production-detail] Producción reconocida sin líneas snapshot", { settlementId, totalProduction: summary.totalProduction });
    if (differs(productionDetailTotals.recognized, summary.totalProduction) || differs(productionDetailTotals.contribution, summary.productionContribution) || differs(productionDetailTotals.commissionBase, summary.productionBase)) {
      console.warn("[settlements/production-detail] Los totales del detalle no cuadran con la liquidación", { settlementId, detail: productionDetailTotals, settlement: { recognized: summary.totalProduction, contribution: summary.productionContribution, commissionBase: summary.productionBase } });
    }
  }, [productionDetailTotals, saleGroups.length, settlementId, summary]);
  const draftPreview = payload?.data.status === "draft" ? draftFinancialPreview.netPay : numeric(payload?.data.net_pay_amount); const paymentTotal = cents(paymentParts.reduce((total, part) => total + numeric(part.amount), 0)); const paymentPendingLabel = `Saldo pendiente: ${formatMoney(cents(numeric(payload?.data.net_pay_amount) - paymentTotal))}`; void paymentPendingLabel;
  async function persistDraft(): Promise<boolean> { if (!payload || payload.data.status !== "draft" || debtInvalid) return false; setSaveState("saving"); try { const debtDeductions = Object.entries(debtAmounts).filter(([, value]) => numeric(value) > 0).map(([debtId, value]) => ({ debtId, amount: cents(numeric(value)) })); const response = await fetch(`/api/admin/settlements/${settlementId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update_draft", commissionRate: numeric(rate), debtDeductions, highRateNote: highRateNote || null }) }); const result = await readFunctionalError(response); if (!response.ok) throw result; await load(); setSaveState("saved"); return true; } catch (error) { setSaveState("error"); void Swal.fire({ icon: "error", title: "No se guardaron los cambios del borrador", text: errorText(error) }); return false; } }
  function markDraftDirty() { setSaveState("unsaved"); }
  async function settlementAction(action: "confirm" | "approve" | "cancel" | "pay") { if (!payload) return; const discarding = action === "cancel" && payload.data.status === "draft"; if (action === "confirm" && (saveState === "saving" || debtInvalid || (numeric(rate) > 60 && !highRateNote.trim()))) return; if (action === "confirm" && saveState !== "saved" && !await persistDraft()) return; if (action === "cancel" && !discarding && (!cancelReason || (cancelReason === "OTHER" && !cancelNote.trim()))) return; if (action === "pay" && (paymentInvalid || Math.round(paymentTotal * 100) !== Math.round(numeric(payload.data.net_pay_amount) * 100))) return; setWorking(true); try { const body = action === "confirm" ? { action: "confirm", adjustments: [] } : action === "approve" ? { action: "approve" } : action === "cancel" ? discarding ? { action: "discard_draft" } : { action: "cancel", reasonCode: cancelReason, reason: cancelNote || null } : { action: "pay", paymentParts: paymentParts.map((part) => ({ ...part, amount: cents(numeric(part.amount)) })) }; const response = await fetch(`/api/admin/settlements/${settlementId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const result = await readFunctionalError(response); if (!response.ok) throw result; setCancelReason(""); setCancelNote(""); setShowCancel(false); setShowPayment(false); setPaymentParts([{ paymentMethodId: "", amount: "", reference: "" }]); await load(); } catch (error) { void Swal.fire({ icon: "error", title: discarding ? "No se pudo descartar el borrador" : titleFor(action), text: errorText(error) }); } finally { setWorking(false); } }
  async function requestPaymentConfirmation() { if (!payload || isPaying || paymentRequestInFlight.current || paymentInvalid || Math.round(paymentTotal * 100) !== Math.round(numeric(payload.data.net_pay_amount) * 100)) return; paymentRequestInFlight.current = true; setIsPaying(true); try { const confirmation = await Swal.fire({ icon: "warning", title: "¿Registrar el pago de la liquidación?", text: `Se registrará un pago total de ${formatMoney(numeric(payload.data.net_pay_amount))}.\n\nUna vez pagada, la liquidación quedará cerrada e inmutable.\nNo podrás editarla, anularla ni volver a registrar el pago desde el flujo normal.`, confirmButtonText: "Sí, registrar pago", cancelButtonText: "Cancelar", showCancelButton: true, focusCancel: true, reverseButtons: true }); if (confirmation.isConfirmed !== true) return; await settlementAction("pay"); } finally { paymentRequestInFlight.current = false; setIsPaying(false); } }
  if (loading) return <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">Cargando liquidación…</p>; if (!payload || !summary) return null;
  const { data } = payload; const canCancel = data.status === "draft" || data.status === "review" || data.status === "approved";
  return <div className="space-y-4">
    <OperationOverlay active={working} label={data.status === "approved" ? "Registrando pago…" : "Procesando liquidación…"} />

    {/* Encabezado */}
    <section className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <Link className="text-xs font-medium text-emerald-700 hover:underline" href="/control/liquidaciones">← Liquidaciones</Link>
        <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-950">{String(data.settlement_number)}</h1>
        <p className="mt-0.5 text-sm text-slate-500">{relation(data.employee, "full_name")} · {relation(data.period, "start_date")} al {relation(data.period, "end_date")} · {relation(data.branch, "name")}</p>
      </div>
      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${data.status === "paid" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : data.status === "cancelled" ? "border-rose-200 bg-rose-50 text-rose-700" : data.status === "draft" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-slate-50 text-slate-700"}`}>{getSettlementStatusLabel(data.status)}</span>
    </section>

    {/* KPIs */}
    <section className={`grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-4 ${data.status === "draft" ? "xl:grid-cols-8" : "xl:grid-cols-7"}`}>
      {data.status === "draft" ? (
        <article className="rounded-lg bg-white px-3 py-2.5 ring-1 ring-slate-300 focus-within:ring-emerald-500">
          <label className="block">
            <span className="block truncate text-[11px] font-medium uppercase tracking-wide text-slate-500">% Comisión</span>
            <div className="mt-1 flex items-center gap-1">
              <Input className="h-7 w-full min-w-0 px-2 text-right text-sm tabular-nums" type="number" min="0" max="100" step="0.01" value={rate} onChange={(event) => { setRate(event.target.value); markDraftDirty(); }} />
              <span className="text-xs text-slate-400">%</span>
            </div>
          </label>
          <span className={`mt-1 block truncate text-[10px] ${saveState === "error" ? "text-rose-600" : saveState === "unsaved" ? "text-amber-600" : "text-slate-400"}`}>
            {saveState === "saving" ? "Guardando…" : saveState === "unsaved" ? "Cambios sin guardar" : saveState === "error" ? "Error al guardar" : "Guardado"}
          </span>
        </article>
      ) : null}

      {[["Producción reconocida", summary.totalProduction], ["Aporte operativo", -summary.productionContribution], ["Base comisionable", summary.productionBase], ["Bruto del empleado", numeric(data.gross_pay_amount)], ["Descuento obligatorio", -numeric(data.mandatory_discount_amount)], ["Deudas aplicadas", -(data.status === "draft" ? draftFinancialPreview.selectedDebtTotal : numeric(data.debt_deduction_total))], ["Neto a pagar", draftPreview]].map(([label, value]) => (
        <article key={String(label)} className={`rounded-lg px-3 py-2.5 ${label === "Neto a pagar" ? "bg-emerald-50 ring-1 ring-emerald-200" : "bg-slate-50"}`}>
          <span className="block truncate text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</span>
          <strong className={`mt-1 block text-sm tabular-nums ${label === "Neto a pagar" ? "text-base text-emerald-700" : "text-slate-900"}`}>{formatMoney(Number(value))}</strong>
        </article>
      ))}
    </section>

    {/* Observación de autorización (solo si comisión > 60) */}
    {data.status === "draft" && numeric(rate) > 60 ? (
      <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
        <label className="block text-xs font-medium text-slate-600">
          Observación de autorización *
          <Textarea className="mt-1" rows={2} value={highRateNote} onChange={(event) => { setHighRateNote(event.target.value); markDraftDirty(); }} />
        </label>
      </section>
    ) : null}

    {/* Detalle de producción y ventas */}
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Detalle de producción y ventas</h2>

      <details className="group mt-3 rounded-lg border border-slate-200">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
          <span>
            {saleGroups.length} {saleGroups.length === 1 ? "venta" : "ventas"} ·{" "}
            <span className="tabular-nums">{formatMoney(productionDetailTotals.recognized)}</span> reconocido
          </span>
          <span className="text-slate-400 transition-transform group-open:rotate-180">▾</span>
        </summary>

        <div className="space-y-3 border-t border-slate-200 p-3 text-sm">
          {saleGroups.length === 0 ? (
            <p className="py-6 text-center text-slate-500">No existen líneas de producción asociadas a este borrador.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[1200px] table-fixed text-xs">
                <colgroup>
                  <col className="w-[90px]" />
                  <col className="w-[110px]" />
                  <col className="w-[220px]" />
                  <col className="w-[100px]" />
                  <col className="w-[90px]" />
                  <col className="w-[100px]" />
                  <col className="w-[90px]" />
                  <col className="w-[90px]" />
                  <col className="w-[70px]" />
                  <col className="w-[100px]" />
                  <col className="w-[110px]" />
                  <col className="w-[90px]" />
                </colgroup>

                <thead className="sticky top-0 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr className="border-b border-slate-200">
                    <th className="px-3 py-2 text-left">Fecha</th>
                    <th className="px-3 py-2 text-left">Venta</th>
                    <th className="px-3 py-2 text-left">Detalle</th>
                    <th className="px-3 py-2 text-left">Origen</th>
                    <th className="px-3 py-2 text-right">Bruto</th>
                    <th className="px-3 py-2 text-right">Reconocido</th>
                    <th className="px-3 py-2 text-right">Aporte</th>
                    <th className="px-3 py-2 text-right">Base</th>
                    <th className="px-3 py-2 text-right">%</th>
                    <th className="px-3 py-2 text-right">Comisión</th>
                    <th className="px-3 py-2 text-right">Comisión fija</th>
                    <th className="px-3 py-2 text-right">Bono</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {saleGroups.flatMap((sale) => [
                    ...sale.services.map((line) => (
                      <tr key={line.id} className="border-l-2 border-l-sky-400 hover:bg-slate-50">
                        <td className="px-3 py-2 text-left">{line.accountingDate || sale.date || "—"}</td>
                        <td className="truncate px-3 py-2 text-left font-medium text-slate-900">{sale.reference}</td>
                        <td className="truncate px-3 py-2 text-left">{line.serviceName}</td>
                        <td className="truncate px-3 py-2 text-left">{line.origin}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(line.commercialValue)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(line.recognized)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(line.contribution)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(line.commissionBase)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{line.commissionRate.toFixed(2)} %</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(line.commission)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(line.fixedCommission)}</td>
                        <td className="px-3 py-2 text-right text-slate-300">—</td>
                      </tr>
                    )),
                    ...sale.products.map((line) => (
                      <tr key={line.id} className="border-l-2 border-l-amber-400 bg-slate-50/60 hover:bg-slate-100/70">
                        <td className="px-3 py-2 text-left">{line.accountingDate || sale.date || "—"}</td>
                        <td className="truncate px-3 py-2 text-left font-medium text-slate-900">{sale.reference}</td>
                        <td className="truncate px-3 py-2 text-left">Producto: {line.productName} · x{line.quantity}</td>
                        <td className="truncate px-3 py-2 text-left">{line.origin}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(line.salesGross)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(line.recognized)}</td>
                        <td className="px-3 py-2 text-right text-slate-300">—</td>
                        <td className="px-3 py-2 text-right text-slate-300">—</td>
                        <td className="px-3 py-2 text-right text-slate-300">—</td>
                        <td className="px-3 py-2 text-right text-slate-300">—</td>
                        <td className="px-3 py-2 text-right text-slate-300">—</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(line.bonus)}</td>
                      </tr>
                    )),
                  ])}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-center">
              <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">Producción reconocida detallada</span>
              <strong className="mt-1 block text-sm tabular-nums text-slate-900">{formatMoney(productionDetailTotals.recognized)}</strong>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-center">
              <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">Aporte detallado</span>
              <strong className="mt-1 block text-sm tabular-nums text-slate-900">{formatMoney(productionDetailTotals.contribution)}</strong>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-center">
              <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">Base detallada</span>
              <strong className="mt-1 block text-sm tabular-nums text-slate-900">{formatMoney(productionDetailTotals.commissionBase)}</strong>
            </div>
          </div>
        </div>
      </details>
    </section>

    {/* Selección de deudas */}
    {data.status === "draft" ? <SettlementDebtSelection debts={debts} amounts={debtAmounts} totals={debtTotals} maximumAmounts={debtMaximums} remainingDebtCapacity={draftFinancialPreview.maxAdditionalDebt} onAmount={(debt, value) => { const next = { ...debtAmounts, [debt.debt_id]: value }; setDebtAmounts(next); setDebtTotals((current) => ({ ...current, [debt.debt_id]: false })); markDraftDirty(); }} onTotal={(debt, checked) => { const next = { ...debtAmounts, [debt.debt_id]: checked ? String(debtMaximums[debt.debt_id] ?? 0) : "" }; setDebtAmounts(next); setDebtTotals((current) => ({ ...current, [debt.debt_id]: checked })); markDraftDirty(); }} /> : null}

    {/* Resumen */}
    {data.status === "draft" ? <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Resumen de liquidación</h2>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 p-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Ingresos</h3>
          <div className="mt-2 space-y-1.5 text-sm text-slate-700">
            <div className="flex justify-between gap-3"><span>Comisión porcentual</span><strong className="tabular-nums text-slate-900">{formatMoney(draftFinancialPreview.percentageCommission)}</strong></div>
            {draftFinancialPreview.fixedCommissions > 0 ? <div className="flex justify-between gap-3"><span>Comisiones fijas</span><strong className="tabular-nums text-slate-900">{formatMoney(draftFinancialPreview.fixedCommissions)}</strong></div> : null}
            {draftFinancialPreview.productBonuses > 0 ? <div className="flex justify-between gap-3"><span>Bonos por productos</span><strong className="tabular-nums text-slate-900">{formatMoney(draftFinancialPreview.productBonuses)}</strong></div> : null}
            {draftFinancialPreview.manualBonuses > 0 ? <div className="flex justify-between gap-3"><span>Otros bonos</span><strong className="tabular-nums text-slate-900">{formatMoney(draftFinancialPreview.manualBonuses)}</strong></div> : null}
            <div className="flex justify-between gap-3 border-t border-slate-200 pt-2 font-semibold text-slate-900"><span>Total ingresos</span><span className="tabular-nums">{formatMoney(draftFinancialPreview.totalIncome)}</span></div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 p-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">Egresos fijos</h3>
          <div className="mt-2 space-y-1.5 text-sm text-slate-700">
            <div className="flex justify-between gap-3"><span>Descuento obligatorio</span><strong className="tabular-nums text-slate-900">-{formatMoney(draftFinancialPreview.mandatoryDiscount)}</strong></div>
            {draftFinancialPreview.otherDeductions > 0 ? <div className="flex justify-between gap-3"><span>Otros descuentos</span><strong className="tabular-nums text-slate-900">-{formatMoney(draftFinancialPreview.otherDeductions)}</strong></div> : null}
            <div className="flex justify-between gap-3 border-t border-slate-200 pt-2 font-semibold text-slate-900"><span>Neto antes de deudas</span><span className="tabular-nums">{formatMoney(draftFinancialPreview.netBeforeDebt)}</span></div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 p-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">Deudas seleccionadas</h3>
          <div className="mt-2 space-y-1.5 text-sm text-slate-700">
            {selectedDebts.length === 0 ? <p className="text-slate-500">Sin deudas seleccionadas.</p> : selectedDebts.map(({ debt, amount }) => <div key={debt.debt_id} className="flex justify-between gap-3"><span className="min-w-0 truncate">{debt.debt_label} · {debt.description}</span><strong className="tabular-nums text-slate-900">-{formatMoney(amount)}</strong></div>)}
            <div className="flex justify-between gap-3 border-t border-slate-200 pt-2 font-semibold text-slate-900"><span>Total deudas</span><span className="tabular-nums">-{formatMoney(draftFinancialPreview.selectedDebtTotal)}</span></div>
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <span className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-500">Neto antes de deudas <strong className="mt-0.5 block text-sm tabular-nums text-slate-900">{formatMoney(draftFinancialPreview.netBeforeDebt)}</strong></span>
        <span className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-500">Deudas seleccionadas <strong className="mt-0.5 block text-sm tabular-nums text-rose-700">-{formatMoney(draftFinancialPreview.selectedDebtTotal)}</strong></span>
        <span className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-500">Total egresos <strong className="mt-0.5 block text-sm tabular-nums text-rose-700">-{formatMoney(draftFinancialPreview.totalExpenses)}</strong></span>
      </div>

      <div className={debtInvalid ? "mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3" : "mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3"}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-600">Disponible para aplicar a deudas <strong className="ml-2 text-sm tabular-nums text-slate-950">{formatMoney(draftFinancialPreview.maxAdditionalDebt)}</strong></span>
          <span className="text-right"><span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Neto final a pagar</span><strong className="ml-3 text-lg tabular-nums text-emerald-700">{formatMoney(draftFinancialPreview.netPay)}</strong></span>
        </div>
        {debtInvalid ? <p className="mt-2 text-xs font-medium text-rose-700">Corrige los montos de deuda que exceden el máximo disponible antes de guardar.</p> : null}
      </div>
    </section> : <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Resumen de liquidación</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 p-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Ingresos</h3>
          <div className="mt-2 space-y-1.5">{summary.incomes.map((line) => <div key={line.id} className="flex justify-between gap-3 text-sm text-slate-700"><span>{line.label}</span><strong className="tabular-nums text-slate-900">{formatMoney(line.amount)}</strong></div>)}</div>
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">Egresos</h3>
          <div className="mt-2 space-y-1.5">{summary.expenses.map((line) => <div key={line.id} className="flex justify-between gap-3 text-sm text-slate-700"><span>{line.label}</span><strong className="tabular-nums text-slate-900">-{formatMoney(line.amount)}</strong></div>)}</div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Neto a pagar</span>
        <strong className="text-lg tabular-nums text-emerald-700">{formatMoney(draftPreview)}</strong>
      </div>
    </section>}

    {/* Acciones */}
    <section className="flex flex-wrap justify-end gap-2">
      {canCancel ? <Button className="bg-rose-600 hover:bg-rose-500" disabled={working} onClick={() => data.status === "draft" ? void settlementAction("cancel") : setShowCancel(true)}>{data.status === "draft" ? "Descartar borrador" : "Anular liquidación"}</Button> : null}
      {data.status === "draft" ? <Button className="border border-slate-200 bg-white text-slate-700 hover:bg-slate-50" disabled={working || saveState === "saved" || saveState === "saving" || debtInvalid || (numeric(rate) > 60 && !highRateNote.trim())} onClick={() => void persistDraft()}>Guardar borrador</Button> : null}
      {data.status === "draft" ? <Button disabled={working || saveState === "saving" || debtInvalid || (numeric(rate) > 60 && !highRateNote.trim())} onClick={() => void settlementAction("confirm")}>Confirmar liquidación</Button> : null}
      {data.status === "review" ? <Button disabled={working} onClick={() => void settlementAction("approve")}>Finalizar confirmación</Button> : null}
      {data.status === "approved" ? <Button disabled={working} onClick={() => setShowPayment(true)}>Pagar</Button> : null}
    </section>

    {/* Pagos registrados */}
    {data.status === "paid" ? <section className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
      <h2 className="text-sm font-semibold text-slate-900">Pagos registrados</h2>
      <div className="mt-3 space-y-1.5 text-sm text-slate-700">{payload.payments.map((payment) => <div key={String(payment.id)} className="flex justify-between gap-3 rounded-lg bg-white px-3 py-2"><span>{relation(payment.payment_method, "name")} {payment.reference ? `· ${String(payment.reference)}` : ""}</span><strong className="tabular-nums text-slate-900">{formatMoney(numeric(payment.amount))}</strong></div>)}</div>
    </section> : null}

    {/* Documento */}
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Documento / PDF</h2>
          <p className="mt-0.5 text-xs text-slate-500">Se construye a partir de los snapshots de la liquidación.</p>
        </div>
        <Button className="border border-slate-200 bg-white text-slate-700 hover:bg-slate-50" onClick={() => setShowDocument(true)}>Ver documento</Button>
      </div>
    </section>

    {/* Modal documento */}
    <Modal open={showDocument} title="Documento de liquidación" description="Vista previa del PDF generado por el servidor." onClose={() => setShowDocument(false)} size="xl" footer={<div className="flex justify-end gap-2"><Button className="border border-slate-200 bg-white text-slate-700" onClick={() => setShowDocument(false)}>Cerrar</Button><Button disabled={!pdfUrl} onClick={() => { if (pdfUrl) window.open(pdfUrl, "_blank", "noopener"); }}>Descargar PDF</Button></div>}>
      {pdfLoading ? <p className="p-8 text-center text-sm text-slate-500">Cargando documento…</p> : pdfUrl ? <iframe className="h-[70vh] w-full rounded-lg border border-slate-200" src={pdfUrl} title="Documento PDF de liquidación" /> : <p className="p-8 text-center text-sm text-rose-700">Error al cargar documento.</p>}
    </Modal>

    {/* Modal pago */}
    <Modal open={showPayment} title="Registrar pago" description="Distribuye exactamente el neto entre los métodos de pago." onClose={() => { if (!isPaying) setShowPayment(false); }} size="lg">
      <div className="space-y-3">
        <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Neto</span><strong className="tabular-nums text-slate-900">{formatMoney(numeric(data.net_pay_amount))}</strong></div>
          <div className="flex justify-between"><span className="text-slate-500">Total distribuido</span><strong className="tabular-nums text-slate-900">{formatMoney(paymentTotal)}</strong></div>
        </div>

        <fieldset disabled={isPaying} className="contents">{paymentParts.map((part, index) => { const kind = methodsById.get(part.paymentMethodId)?.payment_kind; const required = kind === "wallet_qr" || kind === "bank_transfer"; return <div key={index} className="grid items-center gap-2 md:grid-cols-[1fr_140px_1fr_auto]"><Select value={part.paymentMethodId} onChange={(event) => setPaymentParts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, paymentMethodId: event.target.value } : item))}><option value="">Método de pago</option>{methods.map((candidate) => <option key={candidate.id} value={candidate.id} disabled={candidate.id !== part.paymentMethodId && paymentParts.some((other, otherIndex) => otherIndex !== index && other.paymentMethodId === candidate.id)}>{candidate.name}</option>)}</Select><Input type="number" min="0.01" step="0.01" value={part.amount} onChange={(event) => setPaymentParts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, amount: event.target.value } : item))} placeholder="Monto" /><label><span className="sr-only">{required ? "Referencia *" : "Referencia"}</span><Input value={part.reference} onChange={(event) => setPaymentParts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, reference: event.target.value } : item))} placeholder={required ? "Referencia * (obligatoria)" : "Referencia (opcional)"} /></label><Button className="bg-rose-50 text-rose-700 hover:bg-rose-100" disabled={paymentParts.length === 1} onClick={() => setPaymentParts((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Quitar</Button></div>; })}</fieldset>

        {paymentInvalid ? <p className="text-xs text-rose-700">Completa cada parte, no repitas métodos y agrega la referencia requerida para QR/transferencia.</p> : null}

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-3">
          <Button className="border border-slate-200 bg-white text-slate-700" disabled={isPaying} onClick={() => setPaymentParts((current) => [...current, { paymentMethodId: "", amount: "", reference: "" }])}>Agregar método</Button>
          <Button disabled={working || isPaying || paymentInvalid || Math.round(paymentTotal * 100) !== Math.round(numeric(data.net_pay_amount) * 100)} onClick={() => void requestPaymentConfirmation()}>{isPaying ? "Registrando pago…" : "Guardar pago"}</Button>
        </div>
      </div>
    </Modal>

    {/* Modal anulación */}
    <Modal open={showCancel} title={data.status === "draft" ? "Descartar borrador" : "Anular liquidación"} description="La anulación conserva la trazabilidad; una liquidación pagada no puede anularse." onClose={() => setShowCancel(false)} size="md" footer={<div className="flex justify-end gap-2"><Button className="border border-slate-200 bg-white text-slate-700" onClick={() => setShowCancel(false)}>Volver</Button><Button className="bg-rose-600 hover:bg-rose-500" disabled={working || !cancelReason || (cancelReason === "OTHER" && !cancelNote.trim())} onClick={() => void settlementAction("cancel")}>{data.status === "draft" ? "Descartar" : "Confirmar anulación"}</Button></div>}>
      <div className="space-y-3">
        <label className="block text-xs font-medium text-slate-600">Motivo *<Select className="mt-1" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)}><option value="">Seleccionar motivo</option><option value="CALCULATION_ERROR">Error de cálculo</option><option value="WRONG_EMPLOYEE">Empleado incorrecto</option><option value="WRONG_PERIOD">Periodo incorrecto</option><option value="WRONG_PRODUCTION">Producción incorrecta</option><option value="DUPLICATE">Liquidación duplicada</option><option value="ADMINISTRATIVE_CORRECTION">Corrección administrativa</option><option value="OTHER">Otro</option></Select></label>
        <label className="block text-xs font-medium text-slate-600">Observación adicional{cancelReason === "OTHER" ? " *" : ""}<Textarea className="mt-1" value={cancelNote} onChange={(event) => setCancelNote(event.target.value)} placeholder={cancelReason === "OTHER" ? "Observación obligatoria" : "Observación opcional"} /></label>
      </div>
    </Modal>
  </div>;
}
