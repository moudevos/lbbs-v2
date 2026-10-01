"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/select";
import { formatMoney } from "@/features/pos/pos-utils";

type Adjustment = { adjustment_type: "bonus" | "deduction"; description: string; amount: string };
type Detail = { detail: Record<string, unknown>; services: Array<Record<string, unknown>>; bonuses: Array<Record<string, unknown>>; deductions: Array<Record<string, unknown>> };
type Props = { data: Detail | null; adjustments: Adjustment[]; isSaving: boolean; onChange: (items: Adjustment[]) => void; onClose: () => void; onConfirm: () => void };

export function SettlementReviewModal({ data, adjustments, isSaving, onChange, onClose, onConfirm }: Props) {
  const commissionRate = Number(data?.detail.commission_rate ?? 0);
  const mandatoryDiscountRate = Number(data?.detail.mandatory_discount_rate ?? 0);
  const mandatoryDiscountAmount = Number(data?.detail.mandatory_discount_amount ?? 0);
  const debtDeductionTotal = Number(data?.detail.debt_deduction_total ?? 0);
  const grossPayAmount = Number(data?.detail.gross_pay_amount ?? 0);
  const pendingBonusTotal = adjustments
    .filter((item) => item.adjustment_type === "bonus")
    .reduce((total, item) => total + (Number(item.amount) || 0), 0);
  const pendingDeductionTotal = adjustments
    .filter((item) => item.adjustment_type === "deduction")
    .reduce((total, item) => total + (Number(item.amount) || 0), 0);
  const totalDiscounts = mandatoryDiscountAmount + debtDeductionTotal + pendingDeductionTotal;
  const projectedNetPay = Math.max(
    grossPayAmount + pendingBonusTotal - totalDiscounts,
    0,
  );

  return <Modal open={data !== null} title="Confirmar liquidación" description="Valida la producción incluida. La confirmación deja el detalle y los ajustes auditados antes de aprobar." onClose={onClose} isDirty={adjustments.length > 0} size="xl" footer={<div className="flex justify-end gap-2"><Button type="button" className="bg-white text-slate-700" onClick={onClose}>Cancelar</Button><Button type="button" disabled={isSaving} onClick={onConfirm}>{isSaving ? "Guardando..." : "Confirmar liquidación"}</Button></div>}>{data ? <div className="max-h-[68vh] space-y-5 overflow-y-auto pr-1"><section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"><div><p className="text-sm font-semibold text-slate-900">Control de liquidación</p><p className="mt-1 text-xs text-slate-500">La base comisionable determina la comisión. La base del descuento obligatorio determina el aporte. El total de descuentos incluye aporte obligatorio, deudas y ajustes de descuento.</p></div><div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">{[
  ["Base comisionable", data.detail.commissionable_base_total],
  [`Comisión (${commissionRate.toFixed(2)} %)`, data.detail.percentage_commission_total],
  ["Base descuento obligatorio", data.detail.mandatory_discount_base_amount],
  [`Descuento obligatorio (${mandatoryDiscountRate.toFixed(2)} %)`, mandatoryDiscountAmount],
  ["Deudas", debtDeductionTotal],
  ["Ajustes de descuento", pendingDeductionTotal],
  ["Total descuentos", totalDiscounts],
  ["Bonos de productos", data.detail.product_bonus_total],
  ["Ajustes de bono", pendingBonusTotal],
  ["Bruto", grossPayAmount],
  ["Neto proyectado", projectedNetPay],
].map(([label, value]) => <article key={String(label)} className={`rounded-lg border p-3 ${label === "Neto proyectado" ? "border-emerald-200 bg-emerald-50" : label === "Total descuentos" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}><p className="text-xs text-slate-500">{String(label)}</p><p className="mt-1 text-sm font-semibold text-slate-900">{formatMoney(Number(value ?? 0))}</p></article>)}</div></section><section className="overflow-x-auto"><p className="mb-2 text-sm font-semibold">Servicios incluidos</p><table className="min-w-[700px] w-full text-sm"><thead className="border-b text-left text-xs text-slate-500"><tr><th className="p-2">Fecha contable</th><th>Servicio</th><th className="text-right">Base</th><th className="text-right">Comisión</th><th className="text-right">Fija</th></tr></thead><tbody>{data.services.map((line) => <tr key={String(line.id)} className="border-b border-slate-100"><td className="p-2">{String(line.accounting_date_snapshot)}</td><td>{String(line.service_name_snapshot)}</td><td className="text-right">{formatMoney(Number(line.commissionable_amount))}</td><td className="text-right">{formatMoney(Number(line.commission_amount))}</td><td className="text-right">{formatMoney(Number(line.fixed_commission_amount))}</td></tr>)}</tbody></table></section>{data.deductions.length ? <section className="overflow-hidden rounded-xl border border-slate-200"><div className="border-b border-slate-200 bg-slate-50 px-3 py-2"><p className="text-sm font-semibold">Deudas aplicadas</p></div><div className="divide-y divide-slate-100">{data.deductions.map((line) => <div key={String(line.id)} className="flex items-start justify-between gap-4 px-3 py-3 text-sm"><div><p className="font-medium text-slate-900">{String(line.display_type_label ?? line.debt_type_snapshot ?? "Deuda")}</p><p className="text-slate-600">{String(line.display_description ?? line.debt_description_snapshot ?? "Sin detalle")}</p>{Number(line.display_extra_item_count ?? 0) > 0 ? <p className="text-xs text-slate-500">+ {Number(line.display_extra_item_count)} item{Number(line.display_extra_item_count) === 1 ? "" : "s"} más</p> : null}{line.display_sale_reference ? <p className="text-xs font-medium text-slate-500">{String(line.display_sale_reference)}</p> : null}</div><strong className="shrink-0 text-slate-900">-{formatMoney(Number(line.amount ?? 0))}</strong></div>)}</div></section> : null}<section><div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold">Ajustes de confirmación</p><button type="button" className="text-sm font-semibold text-emerald-700 hover:underline" onClick={() => onChange([...adjustments, { adjustment_type: "bonus", description: "", amount: "" }])}>Agregar ajuste</button></div><div className="space-y-2">{adjustments.map((item, index) => <div key={index} className="grid gap-2 sm:grid-cols-[150px_1fr_120px_auto]"><Select value={item.adjustment_type} onChange={(event) => onChange(adjustments.map((current, currentIndex) => currentIndex === index ? { ...current, adjustment_type: event.target.value as Adjustment["adjustment_type"] } : current))}><option value="bonus">Bono</option><option value="deduction">Descuento</option></Select><Input value={item.description} onChange={(event) => onChange(adjustments.map((current, currentIndex) => currentIndex === index ? { ...current, description: event.target.value } : current))} placeholder="Motivo" /><Input type="number" min="0.01" step="0.01" value={item.amount} onChange={(event) => onChange(adjustments.map((current, currentIndex) => currentIndex === index ? { ...current, amount: event.target.value } : current))} placeholder="Monto" /><button type="button" className="text-sm font-semibold text-rose-700" onClick={() => onChange(adjustments.filter((_, currentIndex) => currentIndex !== index))}>Quitar</button></div>)}{!adjustments.length ? <p className="text-sm text-slate-500">Sin ajustes. Se conservará el cálculo mostrado.</p> : null}</div></section></div> : null}</Modal>;
}
