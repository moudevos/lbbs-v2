"use client";

import { faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button } from "@/components/ui/button";
import type { PosPreparedPayment } from "@/features/pos/pos-types";
import { formatMoney, getPaymentMethodLabel } from "@/features/pos/pos-utils";

type PosPaymentListProps = {
  payments: PosPreparedPayment[];
  invalidPaymentIds?: string[];
  onRemovePayment: (paymentId: string) => void;
};

export function PosPaymentList({
  payments,
  invalidPaymentIds = [],
  onRemovePayment,
}: PosPaymentListProps) {
  if (payments.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500">
        Sin pagos agregados.
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {payments.map((payment) => (
        <div
          key={payment.id}
          className={[
            "flex items-center justify-between gap-3 rounded-lg border px-3 py-2",
            invalidPaymentIds.includes(payment.id)
              ? "border-amber-300 bg-amber-50"
              : "border-slate-200 bg-white",
          ].join(" ")}
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">
              {getPaymentMethodLabel(payment.payment_method_code)}
            </p>
            <p className="text-xs text-slate-500">
              Aplicado: {formatMoney(payment.amount)}
              {payment.payment_method_code === "cash" ? (
                <>
                  {" · "}Recibido: {formatMoney(payment.tendered_amount)}
                </>
              ) : null}
            </p>
            {payment.change_amount > 0 ? (
              <p className="text-xs font-semibold text-amber-700">
                Vuelto: {formatMoney(payment.change_amount)}
              </p>
            ) : null}
            {invalidPaymentIds.includes(payment.id) ? (
              <p className="text-xs font-semibold text-amber-700">Requiere ajuste</p>
            ) : null}
          </div>

          <Button
            type="button"
            className="h-8 bg-rose-100 px-3 text-rose-700 hover:bg-rose-200"
            onClick={() => onRemovePayment(payment.id)}
          >
            <FontAwesomeIcon icon={faTrashCan} />
          </Button>
        </div>
      ))}
    </div>
  );
}