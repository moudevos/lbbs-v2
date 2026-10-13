"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/features/pos/pos-utils";
import type { SaleDetailRecord } from "@/features/pos/pos-types";

export type HistoricalReversalPreview = {
  accountingDate: string;
  daysOld: number;
  reversalDeadline: string;
  canReverse: boolean;
  blockCode: string | null;
  blockReason: string | null;
  impact: { stockItems: number; stockQuantity: number; rewardAccruals: number };
};

export type ReversalReason = { id: string; code: string; name: string };
export type RefundInput = { paymentMethodId: string; amount: string; reference: string; selected: boolean };

type Props = {
  open: boolean;
  sale: SaleDetailRecord | null;
  preview: HistoricalReversalPreview | null;
  reasons: ReversalReason[];
  reasonId: string;
  notes: string;
  refunds: RefundInput[];
  isSubmitting: boolean;
  onClose: () => void;
  onReasonChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onRefundChange: (index: number, value: Partial<RefundInput>) => void;
  onSubmit: () => void;
};

export function HistoricalSaleReversalModal({
  open, sale, preview, reasons, reasonId, notes, refunds, isSubmitting,
  onClose, onReasonChange, onNotesChange, onRefundChange, onSubmit,
}: Props) {
  const reason = reasons.find((item) => item.id === reasonId) ?? null;
  const canSubmit = Boolean(preview?.canReverse && reasonId && (reason?.code !== "otro" || notes.trim()));

  return (
    <Modal
      open={open}
      title="Reversa histórica total"
      description="Anula la venta sin reabrir ni modificar el cierre de caja original. El comprobante generado es interno y no fiscal."
      onClose={onClose}
      size="lg"
      footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" className="bg-white text-slate-700" onClick={onClose}>Cancelar</Button><Button type="button" className="bg-rose-600 hover:bg-rose-700" disabled={!canSubmit || isSubmitting} onClick={onSubmit}>{isSubmitting ? "Revirtiendo..." : "Confirmar reversa"}</Button></div>}
    >
      {!sale || !preview ? <p className="text-sm text-slate-600">Revisando condiciones de reversa...</p> : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <article className="rounded-xl bg-slate-50 p-3 text-sm"><p className="text-slate-500">Fecha contable</p><strong>{preview.accountingDate}</strong></article>
            <article className="rounded-xl bg-slate-50 p-3 text-sm"><p className="text-slate-500">Antigüedad</p><strong>{preview.daysOld} día(s)</strong></article>
            <article className="rounded-xl bg-slate-50 p-3 text-sm"><p className="text-slate-500">Total original</p><strong>{formatMoney(sale.total)}</strong></article>
          </div>
          {!preview.canReverse ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><strong>{preview.blockCode}</strong><p className="mt-1">{preview.blockReason}</p></div> : <>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Impacto: revierte producción y bonos no liquidados, Rewards disponibles y {preview.impact.stockQuantity} unidad(es) de inventario. Los pagos y el cierre POS originales quedan intactos.</div>
            <label className="block text-sm font-medium">Motivo <Select className="mt-1" value={reasonId} onChange={(event) => onReasonChange(event.target.value)}><option value="">Seleccionar motivo</option>{reasons.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></label>
            <label className="block text-sm font-medium">Nota {reason?.code === "otro" ? "*" : "(opcional)"}<Textarea className="mt-1" value={notes} onChange={(event) => onNotesChange(event.target.value)} placeholder="Detalle de la reversa" /></label>
            <section className="rounded-xl border border-slate-200"><div className="border-b border-slate-200 px-3 py-2"><p className="text-sm font-semibold">Reembolso registrado (solo auditoría)</p><p className="text-xs text-slate-500">No altera pagos ni caja histórica. Crédito interno no es reembolsable.</p></div><div className="space-y-3 p-3">{refunds.length ? refunds.map((refund, index) => { const payment = sale.payments.find((item) => item.paymentMethodId === refund.paymentMethodId); return <div key={`${refund.paymentMethodId}-${index}`} className="grid gap-2 sm:grid-cols-[auto_1fr_130px_1fr]"><input type="checkbox" checked={refund.selected} onChange={(event) => onRefundChange(index, { selected: event.target.checked })} aria-label={`Registrar reembolso ${payment?.paymentMethodName ?? ""}`} /><span className="self-center text-sm">{payment?.paymentMethodName ?? "Método"} ({formatMoney(payment?.amount ?? 0)})</span><Input type="number" min="0.01" step="0.01" disabled={!refund.selected} value={refund.amount} onChange={(event) => onRefundChange(index, { amount: event.target.value })} /><Input disabled={!refund.selected} value={refund.reference} placeholder="Referencia" onChange={(event) => onRefundChange(index, { reference: event.target.value })} /></div>; }) : <p className="text-sm text-slate-500">La venta no tiene métodos reembolsables.</p>}</div></section>
          </>}
        </div>
      )}
    </Modal>
  );
}
