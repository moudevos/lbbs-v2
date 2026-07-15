"use client";

import { faGift } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Modal } from "@/components/ui/Modal";
import type { PosRewardEntitlement } from "@/features/pos/pos-types";

type PosRewardModalProps = {
  open: boolean;
  availableRewards: PosRewardEntitlement[];
  selectedRewardEntitlementId: string;
  isLoadingRewards: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
};

export function PosRewardModal({
  open,
  availableRewards,
  selectedRewardEntitlementId,
  isLoadingRewards,
  onChange,
  onClose,
}: PosRewardModalProps) {
  function handleSelect(value: string) {
    onChange(value);
    onClose();
  }

  return (
    <Modal
      open={open}
      title="Reward del cliente"
      description="Selecciona el beneficio a aplicar en esta venta."
      onClose={onClose}
      size="lg"
    >
      {isLoadingRewards ? (
        <p className="px-2 py-8 text-center text-sm text-slate-500">Cargando rewards...</p>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {/* Card fija: Sin reward */}
          <button
            type="button"
            onClick={() => handleSelect("")}
            className={[
              "flex h-28 flex-col justify-between rounded-xl border p-3 text-left transition",
              selectedRewardEntitlementId === ""
                ? "border-sky-300 bg-sky-50"
                : "border-slate-200 bg-white hover:border-slate-300",
            ].join(" ")}
          >
            <p className="text-sm font-semibold text-slate-900">Sin reward</p>
            <p className="text-xs text-slate-500">No aplicar ningun beneficio</p>
          </button>

          {availableRewards.length === 0 ? (
            <div className="col-span-full rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              El cliente no tiene rewards disponibles.
            </div>
          ) : (
            availableRewards.map((reward) => {
              const isSelected = selectedRewardEntitlementId === reward.id;

              return (
                <button
                  key={reward.id}
                  type="button"
                  onClick={() => handleSelect(reward.id)}
                  className={[
                    "flex h-28 flex-col justify-between rounded-xl border p-3 text-left transition",
                    isSelected
                      ? "border-sky-300 bg-sky-50"
                      : "border-slate-200 bg-white hover:border-slate-300",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-2">
                    <FontAwesomeIcon
                      icon={faGift}
                      className={[
                        "h-3.5 w-3.5 shrink-0",
                        isSelected ? "text-sky-600" : "text-slate-400",
                      ].join(" ")}
                    />
                    {isSelected ? (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[9px] font-semibold uppercase text-sky-700">
                        Elegido
                      </span>
                    ) : null}
                  </div>

                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-semibold leading-tight text-slate-900">
                      {reward.reward_benefits?.name ?? "Reward disponible"}
                    </p>
                    {reward.reward_benefits?.description ? (
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {reward.reward_benefits.description}
                      </p>
                    ) : null}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </Modal>
  );
}