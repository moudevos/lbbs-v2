"use client";

import { Button } from "@/components/ui/button";
import { formatMoney } from "@/features/pos/pos-utils";
import { buildSettlementDocumentSummary } from "@/features/settlements/settlement-document-summary";
import { getSettlementStatusLabel } from "@/features/settlements/settlement-status";

type Props = { detail: Record<string, unknown>; services: Array<Record<string, unknown>>; bonuses: Array<Record<string, unknown>>; deductions: Array<Record<string, unknown>>; onClose: () => void; onDownload: () => void };
const relation = (value: unknown, key: string) => { const item = Array.isArray(value) ? value[0] : value; return item && typeof item === "object" ? String((item as Record<string, unknown>)[key] ?? "") : ""; };

function AmountList({ title, lines, tone }: { title: string; lines: ReturnType<typeof buildSettlementDocumentSummary>["incomes"]; tone: "income" | "expense" }) {
  return <section className={`rounded-xl border p-4 ${tone === "income" ? "border-emerald-100 bg-emerald-50/40" : "border-rose-100 bg-rose-50/40"}`}><h3 className="text-sm font-semibold text-slate-900">{title}</h3>{lines.length ? <div className="mt-3 space-y-2">{lines.map((line) => <div key={`${line.label}-${line.detail ?? ""}`} className="flex items-baseline justify-between gap-3 text-sm"><span className="text-slate-600">{line.label}{line.detail ? <small className="ml-1 text-slate-400">({line.detail})</small> : null}</span><strong className={tone === "income" ? "text-emerald-700" : "text-rose-700"}>{tone === "expense" ? "-" : ""}{formatMoney(line.amount)}</strong></div>)}</div> : <p className="mt-3 text-sm text-slate-500">Sin conceptos aplicados.</p>}</section>;
}

export function EmployeeSettlementDocument({ detail, services, bonuses: _bonuses, deductions, onClose, onDownload }: Props) {
  const isPaid = detail.status === "paid";
  const summary = buildSettlementDocumentSummary(detail, services, deductions);
  return <div className="settlement-print-area space-y-5 bg-white text-slate-900">
    <div className="no-print flex justify-end gap-2"><Button type="button" className="bg-slate-100 text-slate-700 hover:bg-slate-200" onClick={onClose}>Cerrar</Button><Button type="button" className="bg-white text-slate-700" onClick={onDownload}>Descargar PDF</Button><Button type="button" onClick={() => window.print()}>Imprimir</Button></div>
    <header className="border-b-2 border-slate-900 pb-4"><p className="text-xl font-bold">La Bajadita Barber Studio</p><p className="mt-1 text-sm">{isPaid ? "Comprobante de pago de liquidación" : "Liquidación operativa de empleado"} · No es documento tributario</p></header>
    <section className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm"><p>Número: <strong>{String(detail.settlement_number ?? "")}</strong></p><p>Estado: <strong>{getSettlementStatusLabel(String(detail.status ?? ""))}</strong></p><p>Empleado: <strong>{relation(detail.employee, "full_name")}</strong></p><p>Documento: <strong>{relation(detail.employee, "document_number") || "Sin registro"}</strong></p><p>Sede: <strong>{relation(detail.branch, "name")}</strong></p><p>Periodo: <strong>{relation(detail.period, "start_date")} al {relation(detail.period, "end_date")}</strong></p></section>
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-4"><h2 className="text-sm font-semibold text-slate-900">Resumen de servicios</h2><div className="mt-3 grid gap-3 sm:grid-cols-4"><div><p className="text-xs text-slate-500">Total de servicios</p><strong>{summary.serviceCount}</strong></div><div><p className="text-xs text-slate-500">Total de servicios (bruto)</p><strong>{formatMoney(summary.servicesGross)}</strong></div><div><p className="text-xs text-slate-500">Descuento por producción</p><strong>-{formatMoney(summary.productionDiscount)}</strong></div><div><p className="text-xs text-slate-500">Base de producción</p><strong>{formatMoney(summary.productionBase)}</strong></div></div></section>
    <section className="grid gap-4 sm:grid-cols-2"><AmountList title="Ingresos" lines={summary.incomes} tone="income" /><AmountList title="Egresos" lines={summary.expenses} tone="expense" /></section>
    <section className="rounded-xl border-2 border-slate-900 p-4 text-sm"><div className="flex justify-between"><span>Total ingresos</span><strong>{formatMoney(summary.totalIncome)}</strong></div><div className="mt-2 flex justify-between"><span>Total egresos</span><strong>-{formatMoney(summary.totalExpenses)}</strong></div><div className="mt-3 flex justify-between border-t border-slate-200 pt-3 text-lg"><span>Neto final a pagar</span><strong>{formatMoney(Number(detail.net_pay_amount ?? 0))}</strong></div></section>
    <section className="border-t pt-3 text-sm"><p>Método de pago: <strong>{relation(detail.payment_method, "name") || "Pendiente"}</strong></p>{isPaid ? <p>Fecha de pago: <strong>{String(detail.paid_at ?? "")}</strong></p> : null}<p>Observaciones: {String(detail.notes ?? "Sin observaciones")}</p><p className="mt-2">Confirmó: {relation(detail.reviewed, "full_name") || "Pendiente"} · Aprobó: {relation(detail.approved, "full_name") || "Pendiente"} · Pago: {relation(detail.paid, "full_name") || "Pendiente"}</p></section>
  </div>;
}
