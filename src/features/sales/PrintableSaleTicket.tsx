"use client";

import Image from "next/image";

import { Button } from "@/components/ui/button";
import type { SaleDocumentPayload } from "@/lib/sales/sale-document-types";
import { formatMoney } from "@/features/pos/pos-utils";
import { printSaleTicket } from "@/lib/sales/print-sale-ticket";

type Props = { payload: SaleDocumentPayload; onClose?: () => void; onNewSale?: () => void; onViewDetail?: () => void };

export function PrintableSaleTicket({ payload, onClose, onNewSale, onViewDetail }: Props) {
  const isCancelled = payload.sale.status === "cancelled";
  return (
    <div className="ticket-print-area mx-auto w-full max-w-[360px] bg-white p-4 font-sans text-xs text-slate-900">
      <div className="no-print mb-4 flex justify-end gap-2">
        {onClose ? <Button type="button" className="bg-slate-100 text-slate-700 hover:bg-slate-200" onClick={onClose}>Cerrar</Button> : null}
        {onViewDetail ? <Button type="button" className="bg-slate-100 text-slate-700 hover:bg-slate-200" onClick={onViewDetail}>Ver detalle</Button> : null}
        <Button type="button" onClick={() => printSaleTicket(payload)}>Imprimir</Button>
        {onNewSale ? <Button type="button" onClick={onNewSale}>Nueva venta</Button> : null}
      </div>
      <header className="border-b border-dashed border-slate-400 pb-3 text-center">
        <Image src="/branch/logobg.png" alt="La Bajadita Barber Studio" width={72} height={72} className="mx-auto h-14 w-auto object-contain" />
        <p className="mt-2 text-sm font-bold">{payload.issuer.business_name}</p>
        <p>{payload.branch.name}</p>
        {payload.branch.address ? <p>{payload.branch.address}</p> : null}
        {payload.branch.phone ? <p>{payload.branch.phone}</p> : null}
        <p className="mt-2 font-semibold">Ticket interno de venta</p>
        <p>{payload.sale.number}</p>
        <p>{new Intl.DateTimeFormat("es-PE", { dateStyle: "short", timeStyle: "short" }).format(new Date(payload.sale.issued_at))}</p>
        {isCancelled ? <div className="mt-3 border-2 border-rose-700 px-2 py-2 text-rose-700"><p className="text-sm font-bold">VENTA ANULADA</p>{payload.sale.cancellation?.cancelled_at ? <p>{new Intl.DateTimeFormat("es-PE", { dateStyle: "short", timeStyle: "short" }).format(new Date(payload.sale.cancellation.cancelled_at))}</p> : null}{payload.sale.cancellation?.cancelled_by ? <p>Por: {payload.sale.cancellation.cancelled_by}</p> : null}{payload.sale.cancellation?.reason ? <p>Motivo: {payload.sale.cancellation.reason}</p> : null}{payload.sale.cancellation?.notes ? <p>Observacion: {payload.sale.cancellation.notes}</p> : null}</div> : null}
      </header>
      <section className="space-y-1 border-b border-dashed border-slate-400 py-3">
        <p>Cajero: {payload.employees.cashier.name ?? "Sin registro"}</p>
        <p>Cliente: {payload.customer.name}</p>
        {payload.customer.document_number ? <p>Documento: {payload.customer.document_number}</p> : null}
        {payload.employees.barber.name ? <p>Barbero: {payload.employees.barber.name}</p> : null}
      </section>
      <section className="border-b border-dashed border-slate-400 py-3">
        {payload.items.map((item, index) => <div key={`${item.description}-${index}`} className="mb-2"><div className="flex justify-between gap-3 font-medium"><span>{item.quantity} x {item.description}</span><span>{formatMoney(item.net_amount)}</span></div><div className="flex justify-between text-slate-500"><span>{formatMoney(item.unit_price)} c/u</span>{item.commercial_discount + item.reward_discount + item.courtesy_discount > 0 ? <span>Desc. {formatMoney(item.commercial_discount + item.reward_discount + item.courtesy_discount)}</span> : null}</div></div>)}
      </section>
      <section className="space-y-1 border-b border-dashed border-slate-400 py-3">
        <div className="flex justify-between"><span>Subtotal</span><span>{formatMoney(payload.totals.gross_amount)}</span></div>
        {payload.totals.commercial_discount > 0 ? <div className="flex justify-between"><span>Descuento comercial</span><span>-{formatMoney(payload.totals.commercial_discount)}</span></div> : null}
        {payload.reward ? <div className="flex justify-between"><span>Reward: {payload.reward.name}</span><span>-{formatMoney(payload.reward.amount)}</span></div> : null}
        {payload.totals.courtesy_discount > 0 ? <div className="flex justify-between"><span>Cortesias</span><span>-{formatMoney(payload.totals.courtesy_discount)}</span></div> : null}
        <div className="flex justify-between border-t border-slate-300 pt-1 text-sm font-bold"><span>Total por pagar</span><span>{formatMoney(payload.totals.payable_amount)}</span></div>
      </section>
      <section className="space-y-1 py-3">
        {payload.totals.payable_amount === 0 ? <p className="font-semibold text-emerald-700">Pago monetario: No requerido</p> : payload.payments.map((payment, index) => <div key={`${payment.method_code}-${index}`} className="flex justify-between"><span>{payment.method_name}{payment.tendered_amount > payment.applied_amount ? ` recibido ${formatMoney(payment.tendered_amount)}` : ""}</span><span>{formatMoney(payment.applied_amount)}</span></div>)}
        {payload.totals.change_amount > 0 ? <div className="flex justify-between font-semibold"><span>Vuelto</span><span>{formatMoney(payload.totals.change_amount)}</span></div> : null}
      </section>
      <footer className="border-t border-dashed border-slate-400 pt-3 text-center text-[10px] text-slate-500">Ticket operativo interno. No es comprobante fiscal.</footer>
    </div>
  );
}
