"use client";

import { Select } from "@/components/ui/select";
import type { PosRewardEntitlement } from "@/features/pos/pos-types";
import { formatMoney } from "@/features/pos/pos-utils";

type PosRewardSelectorProps = {
  availableRewards: PosRewardEntitlement[];
  selectedRewardEntitlementId: string;
  rewardDiscount: number;
  isLoadingRewards: boolean;
  onChange: (value: string) => void;
};

export function PosRewardSelector({
  availableRewards,
  selectedRewardEntitlementId,
  rewardDiscount,
  isLoadingRewards,
  onChange,
}: PosRewardSelectorProps) {
  const isDisabled = isLoadingRewards || availableRewards.length === 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">Reward</p>
        {rewardDiscount > 0 ? (
          <span className="text-[11px] font-medium text-emerald-700">
            Ahorro {formatMoney(rewardDiscount)}
          </span>
        ) : null}
      </div>
      <Select
        value={selectedRewardEntitlementId}
        onChange={(event) => onChange(event.target.value)}
        className="h-10"
        disabled={isDisabled}
      >
        <option value="">
          {isLoadingRewards
            ? "Cargando rewards..."
            : availableRewards.length > 0
              ? "Sin reward"
              : "Sin rewards disponibles"}
        </option>
        {availableRewards.map((reward) => (
          <option key={reward.id} value={reward.id}>
            {reward.reward_benefits?.name ?? "Reward disponible"}
          </option>
        ))}
      </Select>
      {selectedRewardEntitlementId ? (
        <p className="text-[11px] text-slate-500">
          Reward aplicado. Se descontara como beneficio en esta venta.
        </p>
      ) : null}
    </div>
  );
}
