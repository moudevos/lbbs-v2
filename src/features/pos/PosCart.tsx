"use client";

import { useMemo, useState } from "react";
import { faCreditCard, faGift, faPenToSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button } from "@/components/ui/button";
import { PosBarberSelector } from "@/features/pos/PosBarberSelector";
import { PosCartItem } from "@/features/pos/PosCartItem";
import { PosCustomerSelector } from "@/features/pos/PosCustomerSelector";
import { PosEmptyState } from "@/features/pos/PosEmptyState";
import { PosPaymentModal } from "@/features/pos/PosPaymentModal";
import { PosRewardModal } from "@/features/pos/PosRewardModal";
import { PosSummary } from "@/features/pos/PosSummary";
import type {
  PosCartItem as PosCartItemRecord,
  PosCustomerRecord,
  PosEmployeeRecord,
  PosPaymentMethodRecord,
  PosPreparedPayment,
  PosRewardEntitlement,
} from "@/features/pos/pos-types";
import { formatMoney, reconcilePosPayments, validateSaleCommercialComposition } from "@/features/pos/pos-utils";

type PosCartProps = {
  customer: PosCustomerRecord | null;
  customerVariousId: string | null;
  items: PosCartItemRecord[];
  barbers: PosEmployeeRecord[];
  selectedBarberId: string;
  barberRequired: boolean;
  availableRewards: PosRewardEntitlement[];
  selectedRewardEntitlementId: string;
  rewardDiscount: number;
  isLoadingRewards: boolean;
  paymentMethods: PosPaymentMethodRecord[];
  payments: PosPreparedPayment[];
  subtotal: number;
  discountTotal: number;
  courtesyTotal: number;
  total: number;
  isClosingSale: boolean;
  canCheckout: boolean;
  onCheckout: () => void;
  onCustomerChange: (customer: PosCustomerRecord) => void;
  onCustomerSearch: (query: string) => Promise<PosCustomerRecord[]>;
  onBarberChange: (value: string) => void;
  onRewardChange: (value: string) => void;
  onDecreaseItem: (itemId: string) => void;
  onIncreaseItem: (itemId: string) => void;
  onRemoveItem: (itemId: string) => void;
  onToggleCourtesy: (itemId: string) => void;
  onCourtesyReasonChange: (itemId: string, value: string) => void;
  onAddPayment: (payment: PosPreparedPayment) => void;
  onRemovePayment: (paymentId: string) => void;
};

export function PosCart({
  customer,
  customerVariousId,
  items,
  barbers,
  selectedBarberId,
  barberRequired,
  availableRewards,
  selectedRewardEntitlementId,
  rewardDiscount,
  isLoadingRewards,
  paymentMethods,
  payments,
  subtotal,
  discountTotal,
  courtesyTotal,
  total,
  isClosingSale,
  canCheckout,
  onCheckout,
  onCustomerChange,
  onCustomerSearch,
  onBarberChange,
  onRewardChange,
  onDecreaseItem,
  onIncreaseItem,
  onRemoveItem,
  onToggleCourtesy,
  onCourtesyReasonChange,
  onAddPayment,
  onRemovePayment,
}: PosCartProps) {
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isRewardModalOpen, setIsRewardModalOpen] = useState(false);

  const reconciliation = useMemo(() => reconcilePosPayments(total, payments), [payments, total]);
  const paidTotal = reconciliation.appliedTotal;
  const pendingBalance = reconciliation.pendingBalance;
  const changeAmount = reconciliation.changeAmount;

  const canShowReward = Boolean(customer) && customer?.id !== customerVariousId;
  const selectedRewardName = availableRewards.find(
    (reward) => reward.id === selectedRewardEntitlementId,
  )?.reward_benefits?.name;

  const commercialComposition = validateSaleCommercialComposition(items);
  const canOpenPayment =
    items.length > 0 && Boolean(customer) && (!barberRequired || Boolean(selectedBarberId));

  const blockMessage = !items.length
    ? "Agrega al menos un item."
    : !customer
      ? "Selecciona un cliente."
      : barberRequired && !selectedBarberId
        ? "Selecciona el barbero del servicio."
        : !commercialComposition.isValid ? commercialComposition.message : null;

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-100 p-3">
      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1">

        <PosCustomerSelector
          value={customer}
          customerVariousId={customerVariousId}
          onChange={onCustomerChange}
          onSearch={onCustomerSearch}
        />

        <section className="mt-2.5 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {items.length > 0 ? (
            items.map((item) => (
              <PosCartItem
                key={item.id}
                item={item}
                onDecrease={() => onDecreaseItem(item.id)}
                onIncrease={() => onIncreaseItem(item.id)}
                onRemove={() => onRemoveItem(item.id)}
                onToggleCourtesy={() => onToggleCourtesy(item.id)}
                onCourtesyReasonChange={(value) => onCourtesyReasonChange(item.id, value)}
              />
            ))
          ) : (
            <PosEmptyState
              title="Carrito vacio"
              description="Agrega un servicio o producto."
            />
          )}
        </section>
      </div>

      <div className="pt-3">
        <PosSummary
          subtotal={subtotal}
          discountTotal={discountTotal}
          courtesyTotal={courtesyTotal}
          rewardDiscount={rewardDiscount}
          rightContent={
            <div className="space-y-3">
              {barberRequired ? (
                <PosBarberSelector
                  value={selectedBarberId}
                  employees={barbers}
                  required={barberRequired}
                  onChange={onBarberChange}
                />
              ) : null}

              {canShowReward ? (
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold text-slate-900">Reward</p>
                  <button
                    type="button"
                    onClick={() => setIsRewardModalOpen(true)}
                    className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 text-left transition hover:border-sky-300"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <FontAwesomeIcon icon={faGift} className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="truncate text-sm text-slate-700">
                        {selectedRewardName ?? "Sin reward"}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {rewardDiscount > 0 ? (
                        <span className="text-[11px] font-medium text-emerald-700">
                          {formatMoney(rewardDiscount)}
                        </span>
                      ) : null}
                      <FontAwesomeIcon icon={faPenToSquare} className="h-3.5 w-3.5 text-slate-400" />
                    </span>
                  </button>
                </div>
              ) : null}
            </div>
          }
        />

        <Button
          type="button"
          className="mt-4 h-14 w-full text-base"
          disabled={!canOpenPayment || !commercialComposition.isValid}
          onClick={() => setIsPaymentModalOpen(true)}
        >
          <FontAwesomeIcon icon={faCreditCard} />
          Pagar
        </Button>

        {blockMessage ? <p className="mt-2 text-xs text-slate-500">{blockMessage}</p> : null}
      </div>

      <PosPaymentModal
        open={isPaymentModalOpen}
        paymentMethods={paymentMethods}
        payments={payments}
        subtotal={subtotal}
        discountTotal={discountTotal}
        courtesyTotal={courtesyTotal}
        rewardDiscount={rewardDiscount}
        total={total}
        paidTotal={paidTotal}
        pendingBalance={pendingBalance}
        changeAmount={changeAmount}
        paymentDifference={reconciliation.difference}
        invalidPaymentIds={reconciliation.invalidPaymentIds}
        requiresAdjustment={reconciliation.requiresAdjustment}
        isClosingSale={isClosingSale}
        canCheckout={canCheckout}
        onAddPayment={onAddPayment}
        onRemovePayment={onRemovePayment}
        onCheckout={onCheckout}
        onRequestClose={() => setIsPaymentModalOpen(false)}
      />

      <PosRewardModal
        open={isRewardModalOpen}
        availableRewards={availableRewards}
        selectedRewardEntitlementId={selectedRewardEntitlementId}
        isLoadingRewards={isLoadingRewards}
        onChange={onRewardChange}
        onClose={() => setIsRewardModalOpen(false)}
      />
    </aside>
  );
}
