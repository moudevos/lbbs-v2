"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import {
  getRewardAppliesToLabel,
  getRewardBenefitSubtitle,
  getRewardBenefitTypeLabel,
} from "@/features/rewards/rewards-format";
import type { RewardBenefitRecord } from "@/features/rewards/rewards-types";

type RewardBenefitsModalProps = {
  open: boolean;
  benefits: RewardBenefitRecord[];
  canManage: boolean;
  togglingBenefitId: string | null;
  onClose: () => void;
  onCreate: () => void;
  onEdit: (benefit: RewardBenefitRecord) => void;
  onToggle: (benefit: RewardBenefitRecord) => void;
};

export function RewardBenefitsModal({
  open,
  benefits,
  canManage,
  togglingBenefitId,
  onClose,
  onCreate,
  onEdit,
  onToggle,
}: RewardBenefitsModalProps) {
  return (
    <Modal
      open={open}
      title="Premios"
      description="Consulta, crea y actualiza los beneficios configurados."
      onClose={onClose}
      confirmBeforeClose={false}
      size="xl"
      footer={
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm text-slate-500">
            {benefits.length} {benefits.length === 1 ? "premio" : "premios"}
          </div>
          <div className="flex items-center gap-2">
            {canManage ? <Button onClick={onCreate}>Nuevo premio</Button> : null}
            <Button
              className="bg-slate-100 text-slate-700 hover:bg-slate-200"
              onClick={onClose}
            >
              Cerrar
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        {benefits.length > 0 ? (
          benefits.map((benefit) => (
            <section
              key={benefit.id}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">{benefit.name}</p>
                    <span
                      className={[
                        "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                        benefit.is_active
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-200 text-slate-600",
                      ].join(" ")}
                    >
                      {benefit.is_active ? "Activo" : "Inactivo"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {getRewardBenefitSubtitle(benefit)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {getRewardBenefitTypeLabel(benefit.benefit_type)}
                    {" - "}
                    {getRewardAppliesToLabel(benefit.applies_to)}
                  </p>
                  {benefit.description ? (
                    <p className="mt-2 text-sm text-slate-600">{benefit.description}</p>
                  ) : null}
                </div>

                {canManage ? (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      className="h-9 bg-white text-slate-700 hover:bg-slate-100"
                      onClick={() => onEdit(benefit)}
                    >
                      Editar
                    </Button>
                    <Button
                      className="h-9"
                      onClick={() => onToggle(benefit)}
                      disabled={togglingBenefitId === benefit.id}
                    >
                      {togglingBenefitId === benefit.id
                        ? "Guardando..."
                        : benefit.is_active
                          ? "Desactivar"
                          : "Activar"}
                    </Button>
                  </div>
                ) : null}
              </div>
            </section>
          ))
        ) : (
          <section className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
            Aun no hay premios configurados.
          </section>
        )}
      </div>
    </Modal>
  );
}
