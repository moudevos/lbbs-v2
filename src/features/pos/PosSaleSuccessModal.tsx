"use client";

import { useEffect, useState } from "react";

import { Modal } from "@/components/ui/Modal";
import { PrintableSaleTicket } from "@/features/sales/PrintableSaleTicket";
import type { SaleDocumentPayload } from "@/lib/sales/sale-document-types";
import type { PosPreparedPayment } from "@/features/pos/pos-types";
import { formatMoney, getPaymentMethodLabel } from "@/features/pos/pos-utils";

type PosSaleReceiptItem = {
  id: string;
  name: string;
  itemType: "service" | "product";
  quantity: number;
  unitPrice: number;
  total: number;
  isCourtesy: boolean;
};

type PosSaleSuccessData = {
  saleId: string;
  saleReference: string;
  occurredAt: string;
  branchName: string;
  customerName: string;
  barberName: string | null;
  reservationCompleted?: boolean;
  items: PosSaleReceiptItem[];
  subtotal: number;
  discountTotal: number;
  courtesyTotal: number;
  total: number;
  payments: PosPreparedPayment[];
  paidTotal: number;
  changeAmount: number;
};

type PosSaleSuccessModalProps = {
  open: boolean;
  data: PosSaleSuccessData | null;
  onClose: () => void;
  onNewSale: () => void;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function PosSaleSuccessModal({
  open,
  data,
  onClose,
  onNewSale,
}: PosSaleSuccessModalProps) {
  const [ticket, setTicket] = useState<SaleDocumentPayload | null>(null);
  const [isLoadingTicket, setIsLoadingTicket] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    if (!open || !data?.saleId) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setTicket(null);
      setIsLoadingTicket(true);
      fetch(`/api/admin/sales/${data.saleId}/ticket`, { cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || "No se pudo cargar el ticket.");
          setTicket(payload.data as SaleDocumentPayload);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          console.error("[pos/ticket] Error al cargar ticket", { message: error instanceof Error ? error.message : "Error inesperado", saleId: data.saleId });
        })
        .finally(() => setIsLoadingTicket(false));
    }, 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [data?.saleId, open]);

  if (!open || !data) {
    return null;
  }

  return (
    <Modal
      open={open}
      title="Ticket interno de venta"
      description="Documento operativo no fiscal."
      onClose={onClose}
      confirmBeforeClose={false}
      size="lg"
      footer={undefined}
    >
      {ticket && !showDetail ? <PrintableSaleTicket payload={ticket} onClose={onClose} onNewSale={onNewSale} onViewDetail={() => setShowDetail(true)} /> : isLoadingTicket ? <p className="text-sm text-slate-600">Preparando ticket interno...</p> : <div className="space-y-5">
        {ticket ? <button type="button" className="text-sm font-medium text-sky-700 hover:text-sky-800" onClick={() => setShowDetail(false)}>Volver al ticket</button> : null}
        <section className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Venta</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{data.saleReference}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Fecha</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {formatDateTime(data.occurredAt)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Sede</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{data.branchName}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Cliente</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{data.customerName}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Barbero</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {data.barberName ?? "Sin barbero"}
              </p>
            </div>
            {data.reservationCompleted ? (
              <div className="sm:col-span-2">
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                  La reserva vinculada quedo marcada como atendida al completar la venta.
                </p>
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200">
          <div className="border-b border-slate-200 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Items</p>
          </div>
          <div className="divide-y divide-slate-200">
            {data.items.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-slate-900">{item.name}</p>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                      {item.itemType === "service" ? "Servicio" : "Producto"}
                    </span>
                    {item.isCourtesy ? (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700">
                        Cortesia
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.quantity} x {formatMoney(item.unitPrice)}
                  </p>
                </div>
                <p className="text-sm font-semibold text-slate-900">{formatMoney(item.total)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-slate-200">
            <div className="border-b border-slate-200 px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">Pagos</p>
            </div>
            <div className="divide-y divide-slate-200">
              {data.payments.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm text-slate-700">
                      {getPaymentMethodLabel(payment.payment_method_code)}
                    </p>
                    {payment.payment_method_code === "cash" ? (
                      <p className="mt-1 text-xs text-slate-500">
                        Recibido: {formatMoney(payment.tendered_amount)}
                      </p>
                    ) : null}
                    {payment.change_amount > 0 ? (
                      <p className="mt-1 text-xs font-semibold text-amber-700">
                        Vuelto: {formatMoney(payment.change_amount)}
                      </p>
                    ) : null}
                  </div>
                  <p className="text-sm font-semibold text-slate-900">
                    {formatMoney(payment.amount)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-slate-600">
                <span>Subtotal</span>
                <span>{formatMoney(data.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-slate-600">
                <span>Descuento</span>
                <span>{formatMoney(data.discountTotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-slate-600">
                <span>Cortesia</span>
                <span>{formatMoney(data.courtesyTotal)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-sm font-semibold text-slate-900">
                <span>Total</span>
                <span>{formatMoney(data.total)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-slate-600">
                <span>Pagado</span>
                <span>{formatMoney(data.paidTotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-slate-600">
                <span>Vuelto</span>
                <span>{formatMoney(data.changeAmount)}</span>
              </div>
            </div>
          </div>
        </section>
      </div>}
    </Modal>
  );
}
