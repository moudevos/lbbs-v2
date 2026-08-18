"use client";

import { useState } from "react";
import { faCreditCard, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import { PosPaymentList } from "@/features/pos/PosPaymentList";
import { PosPaymentPanel } from "@/features/pos/PosPaymentPanel";
import type { PosPaymentMethodRecord, PosPreparedPayment } from "@/features/pos/pos-types";
import { formatMoney } from "@/features/pos/pos-utils";

type PosPaymentModalProps = {
  open: boolean;
  paymentMethods: PosPaymentMethodRecord[];
  payments: PosPreparedPayment[];
  subtotal: number;
  discountTotal: number;
  courtesyTotal: number;
  rewardDiscount: number;
  total: number;
  paidTotal: number;
  pendingBalance: number;
  changeAmount: number;
  paymentDifference: number;
  invalidPaymentIds: string[];
  requiresAdjustment: boolean;
  isClosingSale: boolean;
  canCheckout: boolean;
  onAddPayment: (payment: PosPreparedPayment) => void;
  onRemovePayment: (paymentId: string) => void;
  onCheckout: () => void;
  onRequestClose: () => void;
};

export function PosPaymentModal({
  open,
  paymentMethods,
  payments,
  subtotal,
  discountTotal,
  courtesyTotal,
  rewardDiscount,
  total,
  paidTotal,
  pendingBalance,
  changeAmount,
  paymentDifference,
  invalidPaymentIds,
  requiresAdjustment,
  isClosingSale,
  canCheckout,
  onAddPayment,
  onRemovePayment,
  onCheckout,
  onRequestClose,
}: PosPaymentModalProps) {
  const [isAddingPayment, setIsAddingPayment] = useState(false);
  const quickPaymentMethods = paymentMethods.filter(
    (method) => method.is_active && method.payment_kind !== "internal_credit",
  );

  function handleQuickPayment(method: PosPaymentMethodRecord) {
    if (pendingBalance <= 0) return;

    const amount = Number(pendingBalance.toFixed(2));
    onAddPayment({
      id: crypto.randomUUID(),
      payment_method_id: method.id,
      payment_method_code: method.code,
      payment_method_name: method.name,
      amount,
      tendered_amount: amount,
      change_amount: 0,
      allows_change: method.allows_change,
    });
  }

  return (
    <Modal
      open={open}
      title="Pagar"
      description="Registra los pagos hasta cubrir el total. Cierra solo con los botones de abajo."
      onClose={() => {}}
      confirmBeforeClose={false}
      size="md"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            className="bg-white text-slate-700 shadow-none hover:bg-slate-100"
            onClick={onRequestClose}
          >
            Cerrar
          </Button>
          <Button type="button" disabled={!canCheckout || isClosingSale} onClick={onCheckout}>
            <FontAwesomeIcon icon={faCreditCard} />
            {isClosingSale ? "Cerrando..." : "Completar venta"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Total de venta, destacado */}
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-900 px-4 py-4 text-center">
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
            Total de venta
          </span>
          <span className="mt-1 text-3xl font-bold text-white">{formatMoney(total)}</span>
        </div>

        {/* Saldo y Vuelto */}
        <div className="grid grid-cols-2 gap-2">
          <div
            className={[
              "flex h-16 flex-col items-center justify-center rounded-lg border px-3 text-center",
              pendingBalance > 0 ? "border-red-200 bg-amber-50" : "border-emerald-200 bg-emerald-50",
            ].join(" ")}
          >
            <span className="text-[11px] font-medium text-slate-500">
              {pendingBalance > 0 ? "Pendiente" : "Cubierto"}
            </span>
            <span
              className={[
                "text-lg font-semibold",
                pendingBalance > 0 ? "text-amber-800" : "text-emerald-800",
              ].join(" ")}
            >
              {formatMoney(pendingBalance)}
            </span>
          </div>

          <div
            className={[
              "flex h-16 flex-col items-center justify-center rounded-lg border px-3 text-center",
              changeAmount > 0 ? "border-sky-200 bg-sky-50" : "border-slate-200 bg-slate-50",
            ].join(" ")}
          >
            <span className="text-[11px] font-medium text-slate-500">
              {changeAmount > 0 ? "Entregar vuelto" : "Sin vuelto"}
            </span>
            <span
              className={[
                "text-lg font-semibold",
                changeAmount > 0 ? "text-sky-800" : "text-slate-700",
              ].join(" ")}
            >
              {formatMoney(changeAmount)}
            </span>
          </div>
        </div>

        {/* Resumen completo de la venta */}
        <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>Subtotal</span>
            <span>{formatMoney(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>Descuento</span>
            <span>{formatMoney(discountTotal)}</span>
          </div>
          {rewardDiscount > 0 ? (
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Reward</span>
              <span>{formatMoney(rewardDiscount)}</span>
            </div>
          ) : null}
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>Cortesia</span>
            <span>{formatMoney(courtesyTotal)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 pt-1.5 text-sm text-slate-600">
            <span>Pagado</span>
            <span>{formatMoney(paidTotal)}</span>
          </div>
          {Math.abs(paymentDifference) >= 0.005 ? (
            <div className="flex items-center justify-between text-sm text-amber-700">
              <span>Diferencia de pagos</span>
              <strong>{formatMoney(paymentDifference)}</strong>
            </div>
          ) : null}
        </div>

        {total === 0 ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
            Esta venta no requiere pago monetario.
          </div>
        ) : (
          <>
            <section className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="mb-2">
                <p className="text-sm font-semibold text-slate-800">Cobro rápido</p>
                <p className="text-xs text-slate-500">
                  Registra todo el saldo pendiente con un solo método.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {quickPaymentMethods.map((method) => (
                  <Button
                    key={method.id}
                    type="button"
                    className="h-9 bg-emerald-50 px-3 text-xs text-emerald-800 shadow-none hover:bg-emerald-100"
                    disabled={pendingBalance <= 0 || isClosingSale}
                    onClick={() => handleQuickPayment(method)}
                  >
                    {method.name} · {formatMoney(pendingBalance)}
                  </Button>
                ))}
              </div>
            </section>

            {/* Lista de metodos ya agregados: siempre visible, un solo lugar */}
            <PosPaymentList
              payments={payments}
              invalidPaymentIds={invalidPaymentIds}
              onRemovePayment={onRemovePayment}
            />

            {/* Formulario para agregar, se revela solo al presionar el boton */}
            {!isAddingPayment ? (
              <Button
                type="button"
                className="w-full bg-slate-100 text-slate-700 hover:bg-slate-200"
                onClick={() => setIsAddingPayment(true)}
                disabled={pendingBalance <= 0}
              >
                <FontAwesomeIcon icon={faPlus} />
                Añadir método
              </Button>
            ) : (
              <PosPaymentPanel
                paymentMethods={paymentMethods}
                pendingBalance={pendingBalance}
                onAddPayment={(payment) => {
                  onAddPayment(payment);
                  setIsAddingPayment(false);
                }}
              />
            )}
          </>
        )}

        {requiresAdjustment ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            El reward cambio el total. Ajusta los pagos QR o POS antes de cerrar.
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
