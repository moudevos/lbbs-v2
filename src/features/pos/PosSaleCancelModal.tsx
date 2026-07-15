"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import type { PosRecentSaleRecord } from "@/features/pos/pos-types";
import { formatMoney } from "@/features/pos/pos-utils";
import { PrintableSaleTicket } from "@/features/sales/PrintableSaleTicket";
import type { SaleDocumentPayload } from "@/lib/sales/sale-document-types";

type PosSaleCancelModalProps = {
  open: boolean;
  sales: PosRecentSaleRecord[];
  isLoading: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (saleId: string, reasonId: string, notes: string) => void;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function PosSaleCancelModal({
  open,
  sales,
  isLoading,
  isSubmitting,
  onClose,
  onSubmit,
}: PosSaleCancelModalProps) {
  const cancellableSales = useMemo(() => sales.filter((sale) => sale.canCancel), [sales]);
  const [selectedSaleId, setSelectedSaleId] = useState("");
  const [reasonId, setReasonId] = useState("");
  const [notes, setNotes] = useState("");
  const [ticket, setTicket] = useState<SaleDocumentPayload | null>(null);
  const reasonsQuery = useQuery({ queryKey: ["sales", "cancellation-reasons"], queryFn: async () => { const response = await fetch("/api/admin/sale-cancellation-reasons"); const payload = await response.json(); if (!response.ok) throw new Error(payload.error); return payload.data as Array<{id:string;code:string;name:string}>; }, enabled: open });
  const selectedReason = reasonsQuery.data?.find((item) => item.id === reasonId) ?? null;
  const effectiveSelectedSaleId = cancellableSales.some((sale) => sale.id === selectedSaleId)
    ? selectedSaleId
    : cancellableSales[0]?.id ?? "";
  const selectedSale = cancellableSales.find((sale) => sale.id === effectiveSelectedSaleId) ?? null;

  function handleClose() {
    setSelectedSaleId("");
    setReasonId("");
    setNotes("");
    setTicket(null);
    onClose();
  }

  async function loadTicket() {
    if (!selectedSale) return;
    const response = await fetch(`/api/admin/sales/${selectedSale.id}/ticket`, { cache: "no-store" });
    const payload = await response.json();
    if (response.ok) setTicket(payload.data as SaleDocumentPayload);
  }

  return (
    <Modal
      open={open}
      title="Ventas recientes"
      description="Consulta las ultimas ventas de la sesion y anula solo cuando corresponda."
      onClose={handleClose}
      isDirty={Boolean(reasonId || notes.trim())}
      size="lg"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            className="bg-white text-slate-700 shadow-none hover:bg-slate-100"
            onClick={handleClose}
          >
            Cerrar
          </Button>
          <Button
            type="button"
            disabled={!selectedSale || isLoading || isSubmitting || !reasonId || (selectedReason?.code === "otro" && !notes.trim())}
            onClick={() => {
              if (!selectedSale) {
                return;
              }

              onSubmit(selectedSale.id, reasonId, notes);
            }}
          >
            {isSubmitting ? "Anulando..." : "Confirmar anulacion"}
          </Button>
        </div>
      }
    >
      {ticket ? <PrintableSaleTicket payload={ticket} onClose={() => setTicket(null)} /> : isLoading ? (
        <p className="text-sm text-slate-600">Cargando ventas recientes...</p>
      ) : (
        <div className="space-y-5">
          <div className="space-y-2">
            {sales.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                Aun no hay ventas en esta sesion.
              </div>
            ) : (
              sales.map((sale) => (
                <button
                  key={sale.id}
                  type="button"
                  className={[
                    "w-full rounded-2xl border px-4 py-3 text-left transition",
                    sale.id === effectiveSelectedSaleId
                      ? "border-sky-300 bg-sky-50"
                      : "border-slate-200 bg-white hover:border-slate-300",
                    !sale.canCancel && "opacity-70",
                  ].join(" ")}
                  onClick={() => {
                    if (!sale.canCancel) {
                      return;
                    }

                    setSelectedSaleId(sale.id);
                  }}
                  disabled={!sale.canCancel}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{sale.saleReference}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {sale.customerName}
                        {sale.barberName ? ` · ${sale.barberName}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900">
                        {formatMoney(sale.total)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatDateTime(sale.closedAt ?? sale.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={[
                        "rounded-full px-2 py-1 font-medium",
                        sale.status === "completed"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-600",
                      ].join(" ")}
                    >
                      {sale.status === "completed" ? "Completada" : "No anulable"}
                    </span>
                    {!sale.canCancel && sale.cancelledReason ? (
                      <span className="text-slate-500">Motivo: {sale.cancelledReason}</span>
                    ) : null}
                  </div>
                </button>
              ))
            )}
          </div>

          <section className="space-y-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="sale-cancel-reason">
              Motivo de anulacion
            </label>
            <Select id="sale-cancel-reason" value={reasonId} onChange={(event) => setReasonId(event.target.value)}>
              <option value="">Seleccionar motivo</option>
              {(reasonsQuery.data ?? []).map((reason) => <option key={reason.id} value={reason.id}>{reason.name}</option>)}
            </Select>
            <label className="text-sm font-medium text-slate-700" htmlFor="sale-cancel-notes">
              {selectedReason?.code === "otro" ? "Describe el motivo *" : "Observacion adicional"}
            </label>
            <Textarea
              id="sale-cancel-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Detalle opcional de la anulacion"
              className="min-h-24"
            />
          </section>

          {selectedSale ? (
            <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><div className="flex flex-wrap gap-2"><Button type="button" className="bg-white text-slate-700 hover:bg-slate-100" onClick={() => void loadTicket()}>Imprimir ticket</Button></div><p>Detalle: {selectedSale.customerName} - {formatMoney(selectedSale.total)} - Pagos: {selectedSale.paymentMethodLabels?.join(", ") || "Sin pago monetario"} - Vuelto: {formatMoney(selectedSale.changeAmount)}</p><p>La anulacion revertira el stock descontado y actualizara la caja de la sesion.</p></div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
