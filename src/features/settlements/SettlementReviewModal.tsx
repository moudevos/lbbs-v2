"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/select";
import { formatMoney } from "@/features/pos/pos-utils";
import { buildSettlementFinancialSummary } from "@/features/settlements/settlement-document-summary";

type Adjustment = { adjustment_type: "bonus" | "deduction"; description: string; amount: string };
type Detail = { detail: Record<string, unknown>; services: Array<Record<string, unknown>>; bonuses: Array<Record<string, unknown>>; productLines?: Array<Record<string, unknown>>; deductions: Array<Record<string, unknown>> };
type Props = { data: Detail | null; adjustments: Adjustment[]; isSaving: boolean; onChange: (items: Adjustment[]) => void; onClose: () => void; onConfirm: () => void };

function SummaryCard({ label, value, money = true }: { label: string; value: number; money?: boolean }) {
  return <article className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm font-semibold text-slate-900">{money ? formatMoney(value) : value}</p></article>;
}

export function SettlementReviewModal({ data, adjustments, isSaving, onChange, onClose, onConfirm }: Props) {
  const summary = data ? buildSettlementFinancialSummary(data.detail, data.services, data.deductions, data.productLines ?? []) : null;
  return <Modal open={data !== null} title="Confirmar liquidación" description="Revisa la producción, descuentos y deudas. Este mismo resumen quedará en el documento y PDF." onClose={onClose} isDirty={adjustments.length > 0} size="xl" footer={<div className="flex justify-end gap-2"><Button type="button" className="bg-white text-slate-700" onClick={onClose}>Cancelar</Button><Button type="button" disabled={isSaving} onClick={onConfirm}>{isSaving ? "Guardando..." : "Confirmar liquidación"}</Button></div>}>
    {data && summary ? <div className="max-h-[68vh] space-y-5 overflow-y-auto pr-1">
      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <SummaryCard label="Total servicios" value={summary.serviceCount} money={false} />
        <SummaryCard label="Total productos" value={summary.productCount} money={false} />
        <SummaryCard label="Total Rewards" value={summary.rewardCount} money={false} />
        <SummaryCard label="Bruto de servicios" value={summary.grossServices} />
        <SummaryCard label="Productos atribuidos" value={summary.recognizedProducts} />
        <SummaryCard label="Producción reconocida" value={summary.totalProduction} />
        <SummaryCard label="Aportes de producción" value={summary.productionContribution} />
        <SummaryCard label="Base comisionable" value={summary.productionBase} />
        <SummaryCard label="Comisión aplicada" value={summary.commissionRate} money={false} />
        <SummaryCard label="Bonos" value={Number(data.detail.product_bonus_total ?? 0) + Number(data.detail.reward_fixed_commission_total ?? 0) + Number(data.detail.courtesy_fixed_commission_total ?? 0)} />
        <SummaryCard label="Descuento obligatorio" value={Number(data.detail.mandatory_discount_amount ?? 0)} />
        <SummaryCard label="Deudas seleccionadas" value={Number(data.detail.debt_deduction_total ?? 0)} />
        <SummaryCard label="Ingreso bruto" value={Number(data.detail.gross_pay_amount ?? 0)} />
        <SummaryCard label="Neto actual" value={Number(data.detail.net_pay_amount ?? 0)} />
      </section>

      {summary.productLines.length ? <section className="overflow-x-auto rounded-lg border border-slate-200"><div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800">Productos atribuidos</div><table className="min-w-[850px] w-full text-sm"><thead className="border-b text-left text-xs text-slate-500"><tr><th className="p-2">Fecha</th><th>Venta</th><th>Producto</th><th>Familia</th><th className="text-right">Cantidad</th><th className="text-right">Reconocido</th><th className="text-right">Bono</th></tr></thead><tbody>{summary.productLines.map((line) => <tr key={line.id} className="border-b border-slate-100"><td className="p-2">{line.accountingDate || "—"}</td><td>{line.saleNumber || "—"}</td><td>{line.productName}</td><td>{line.family}</td><td className="text-right">{line.quantity}</td><td className="text-right">{formatMoney(line.recognized)}</td><td className="text-right">{formatMoney(line.bonus)}</td></tr>)}</tbody></table></section> : null}

      <section className="overflow-x-auto rounded-lg border border-slate-200">
        <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800">Detalle de servicios y Rewards</div>
        <table className="min-w-[1060px] w-full text-sm"><thead className="border-b text-left text-xs text-slate-500"><tr><th className="p-2">Fecha</th><th>Servicio</th><th>Origen</th><th className="text-right">Reconocido</th><th className="text-right">Aporte</th><th className="text-right">Base</th><th className="text-right">%</th><th className="text-right">Comisión</th><th className="text-right">Fija</th></tr></thead><tbody>{summary.serviceLines.map((line) => <tr key={line.id} className="border-b border-slate-100"><td className="p-2">{line.accountingDate}</td><td>{line.serviceName}</td><td>{line.origin}</td><td className="text-right">{formatMoney(line.recognized)}</td><td className="text-right">-{formatMoney(line.contribution)}</td><td className="text-right">{formatMoney(line.commissionBase)}</td><td className="text-right">{line.commissionRate.toFixed(2)} %</td><td className="text-right">{formatMoney(line.commission)}</td><td className="text-right">{formatMoney(line.fixedCommission)}</td></tr>)}</tbody></table>
      </section>

      {summary.expenses.length ? <section className="rounded-lg border border-rose-100 bg-rose-50/40 p-4"><p className="text-sm font-semibold text-slate-900">Deudas y descuentos</p><div className="mt-3 space-y-2">{summary.expenses.map((line) => <div key={`${line.label}-${line.detail ?? ""}`} className="flex items-start justify-between gap-3 text-sm"><span className="text-slate-700"><strong>{line.label}</strong>{line.detail ? <small className="block text-slate-500">{line.detail}</small> : null}</span><strong className="text-rose-700">-{formatMoney(line.amount)}</strong></div>)}</div></section> : null}

      <section><div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold">Ajustes de confirmación</p><button type="button" className="text-sm font-semibold text-emerald-700 hover:underline" onClick={() => onChange([...adjustments, { adjustment_type: "bonus", description: "", amount: "" }])}>Agregar ajuste</button></div><div className="space-y-2">{adjustments.map((item, index) => <div key={index} className="grid gap-2 sm:grid-cols-[150px_1fr_120px_auto]"><Select value={item.adjustment_type} onChange={(event) => onChange(adjustments.map((current, currentIndex) => currentIndex === index ? { ...current, adjustment_type: event.target.value as Adjustment["adjustment_type"] } : current))}><option value="bonus">Bono</option><option value="deduction">Descuento</option></Select><Input value={item.description} onChange={(event) => onChange(adjustments.map((current, currentIndex) => currentIndex === index ? { ...current, description: event.target.value } : current))} placeholder="Motivo" /><Input type="number" min="0.01" step="0.01" value={item.amount} onChange={(event) => onChange(adjustments.map((current, currentIndex) => currentIndex === index ? { ...current, amount: event.target.value } : current))} placeholder="Monto" /><button type="button" className="text-sm font-semibold text-rose-700" onClick={() => onChange(adjustments.filter((_, currentIndex) => currentIndex !== index))}>Quitar</button></div>)}{!adjustments.length ? <p className="text-sm text-slate-500">Sin ajustes. Se conservará el cálculo mostrado.</p> : null}</div></section>
    </div> : null}
  </Modal>;
}
