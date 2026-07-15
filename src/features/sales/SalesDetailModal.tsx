"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import type { SaleDetailRecord } from "@/features/pos/pos-types";
import {
  formatMoney,
  getItemTypeLabel,
  getPaymentMethodLabel,
  getSaleStatusLabel,
} from "@/features/pos/pos-utils";

type SalesDetailModalProps = {
  open: boolean;
  sale: SaleDetailRecord | null;
  isLoading: boolean;
  onClose: () => void;
  onReprint: () => void;
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "Sin registro";
  }

  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function SalesDetailModal({ open, sale, isLoading, onClose, onReprint }: SalesDetailModalProps) {
  return (
    <Modal
      open={open}
      title="Detalle de venta"
      description="Resumen completo de la venta seleccionada."
      onClose={onClose}
      confirmBeforeClose={false}
      size="xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onReprint} disabled={isLoading || !sale}>
            Reimprimir ticket
          </Button>
          <Button
            type="button"
            className="bg-white text-slate-700 shadow-none hover:bg-slate-100"
            onClick={onClose}
          >
            Cerrar
          </Button>
        </div>
      }
    >
      {isLoading || !sale ? (
        <p className="text-sm text-slate-600">Cargando detalle de venta...</p>
      ) : (
        <div className="space-y-5">
          <section className="grid gap-3 md:grid-cols-3">
            <article className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Venta</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{sale.saleReference}</p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Estado</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {getSaleStatusLabel(sale.status)}
              </p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Fecha</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {formatDateTime(sale.closedAt ?? sale.createdAt)}
              </p>
            </article>
          </section>

          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Sede</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{sale.branchName}</p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Cliente</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{sale.customerName}</p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Barbero</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {sale.barberName ?? "Sin barbero"}
              </p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Usuario que cerro</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {sale.closedByName ?? "Sin registro"}
              </p>
            </article>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">Items</p>
            </div>
            <div className="divide-y divide-slate-200">
              {sale.items.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-4 px-4 py-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-slate-900">{item.name}</p>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
                        {getItemTypeLabel(item.itemType)}
                      </span>
                      {item.isCourtesy ? (
                        <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">
                          Cortesia
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.quantity} x {formatMoney(item.unitPrice)}
                      {item.barberName ? ` · ${item.barberName}` : ""}
                    </p>
                    {item.courtesyReason ? (
                      <p className="mt-1 text-xs text-slate-500">Motivo: {item.courtesyReason}</p>
                    ) : null}
                  </div>
                  <p className="text-sm font-semibold text-slate-900">{formatMoney(item.total)}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-4 py-3">
                <p className="text-sm font-semibold text-slate-900">Pagos</p>
              </div>
              <div className="divide-y divide-slate-200">
                {sale.payments.map((payment) => (
                  <div key={payment.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-sm font-medium text-slate-900">
                        {getPaymentMethodLabel(payment.paymentMethodCode)}
                      </p>
                      <p className="text-sm font-semibold text-slate-900">
                        {formatMoney(payment.amount)}
                      </p>
                    </div>
                    {payment.paymentMethodCode === "cash" ? (
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                        <span>Recibido: {formatMoney(payment.tenderedAmount)}</span>
                        <span>Vuelto: {formatMoney(payment.changeAmount)}</span>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="space-y-2 text-sm text-slate-600">
                <div className="flex items-center justify-between">
                  <span>Subtotal</span>
                  <span>{formatMoney(sale.subtotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Descuento</span>
                  <span>{formatMoney(sale.discountTotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Cortesia</span>
                  <span>{formatMoney(sale.courtesyTotal)}</span>
                </div>
                <div className="flex items-center justify-between font-semibold text-slate-900">
                  <span>Total</span>
                  <span>{formatMoney(sale.total)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Pagado</span>
                  <span>{formatMoney(sale.paidTotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Vuelto</span>
                  <span className={sale.changeAmount > 0 ? "font-semibold text-amber-700" : ""}>
                    {formatMoney(sale.changeAmount)}
                  </span>
                </div>
                {sale.reservationId ? (
                  <div className="flex items-center justify-between">
                    <span>Reserva vinculada</span>
                    <span className="font-medium text-slate-900">{sale.reservationId.slice(0, 8)}</span>
                  </div>
                ) : null}
                {sale.cancelledReason ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    Motivo de anulacion: {sale.cancelledReason}
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      )}
    </Modal>
  );
}
