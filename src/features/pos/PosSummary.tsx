"use client";

import type { ReactNode } from "react";

import { formatMoney } from "@/features/pos/pos-utils";

type PosSummaryProps = {
  subtotal: number;
  discountTotal: number;
  courtesyTotal: number;
  rewardDiscount: number;
  rightContent?: ReactNode;
};

export function PosSummary({
  subtotal,
  discountTotal,
  courtesyTotal,
  rewardDiscount,
  rightContent,
}: PosSummaryProps) {
  return (
    <section className="grid gap-4 border-t border-slate-200 pt-3 sm:grid-cols-2">
      <div className="space-y-2">
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
      </div>

      <div className="space-y-2">{rightContent ?? <div className="hidden sm:block" />}</div>
    </section>
  );
}