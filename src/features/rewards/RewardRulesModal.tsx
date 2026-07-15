"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import {
  getRewardAppliesToLabel,
  getRewardRuleSubtitle,
} from "@/features/rewards/rewards-format";
import type { RewardRuleRecord } from "@/features/rewards/rewards-types";

type RewardRulesModalProps = {
  open: boolean;
  rules: RewardRuleRecord[];
  canManage: boolean;
  togglingRuleId: string | null;
  onClose: () => void;
  onCreate: () => void;
  onEdit: (rule: RewardRuleRecord) => void;
  onToggle: (rule: RewardRuleRecord) => void;
};

export function RewardRulesModal({
  open,
  rules,
  canManage,
  togglingRuleId,
  onClose,
  onCreate,
  onEdit,
  onToggle,
}: RewardRulesModalProps) {
  return (
    <Modal
      open={open}
      title="Reglas"
      description="Consulta, crea y actualiza las reglas activas e inactivas."
      onClose={onClose}
      confirmBeforeClose={false}
      size="xl"
      footer={
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm text-slate-500">
            {rules.length} {rules.length === 1 ? "regla" : "reglas"}
          </div>
          <div className="flex items-center gap-2">
            {canManage ? <Button onClick={onCreate}>Nueva regla</Button> : null}
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
        {rules.length > 0 ? (
          rules.map((rule) => (
            <section
              key={rule.id}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">{rule.name}</p>
                    <span
                      className={[
                        "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                        rule.is_active
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-200 text-slate-600",
                      ].join(" ")}
                    >
                      {rule.is_active ? "Activa" : "Inactiva"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{getRewardRuleSubtitle(rule)}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {getRewardAppliesToLabel(rule.applies_to)}
                  </p>
                  {rule.description ? (
                    <p className="mt-2 text-sm text-slate-600">{rule.description}</p>
                  ) : null}
                </div>

                {canManage ? (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      className="h-9 bg-white text-slate-700 hover:bg-slate-100"
                      onClick={() => onEdit(rule)}
                    >
                      Editar
                    </Button>
                    <Button
                      className="h-9"
                      onClick={() => onToggle(rule)}
                      disabled={togglingRuleId === rule.id}
                    >
                      {togglingRuleId === rule.id
                        ? "Guardando..."
                        : rule.is_active
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
            Aun no hay reglas configuradas.
          </section>
        )}
      </div>
    </Modal>
  );
}
