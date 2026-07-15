"use client";

import { useEffect, useMemo, useState } from "react";
import {
  faBookOpen,
  faChartLine,
  faGift,
  faRotate,
  faTicket,
  faUserPlus,
  faUsers,
  faWandMagicSparkles,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Swal from "sweetalert2";

import { Button } from "@/components/ui/button";
import type { CustomerRecord } from "@/features/customers/customer-types";
import { RewardBenefitFormModal } from "@/features/rewards/RewardBenefitFormModal";
import { RewardBenefitsModal } from "@/features/rewards/RewardBenefitsModal";
import { RewardCustomerProfileModal } from "@/features/rewards/RewardCustomerProfileModal";
import { RewardMigrationModal } from "@/features/rewards/RewardMigrationModal";
import { RewardRuleFormModal } from "@/features/rewards/RewardRuleFormModal";
import { RewardRulesModal } from "@/features/rewards/RewardRulesModal";
import { RewardsTutorialModal } from "@/features/rewards/RewardsTutorialModal";
import {
  fetchRewardsBootstrap,
  registerRewardMigration,
  saveRewardBenefit,
  saveRewardRule,
} from "@/features/rewards/rewards-actions";
import {
  formatRewardsDateTime,
  formatRewardsMoney,
  formatRewardsNumber,
  getRewardAppliesToLabel,
  getRewardBenefitSubtitle,
  getRewardRuleSubtitle,
  toDateTimeLocalValue,
} from "@/features/rewards/rewards-format";
import {
  createEmptyRewardBenefitForm,
  createEmptyRewardRuleForm,
  type RewardBenefitFormValue,
  type RewardBenefitRecord,
  type RewardRuleFormValue,
  type RewardRuleRecord,
  type RewardsBootstrapPayload,
} from "@/features/rewards/rewards-types";

function getRoleLabel(role: RewardsBootstrapPayload["role"]) {
  if (role === "owner") {
    return "Owner";
  }

  if (role === "admin") {
    return "Admin";
  }

  if (role === "reception") {
    return "Recepcion";
  }

  if (role === "barber") {
    return "Barbero";
  }

  return "Consulta";
}

function toRuleFormValue(rule: RewardRuleRecord): RewardRuleFormValue {
  return {
    name: rule.name,
    description: rule.description ?? "",
    metric_type: rule.metric_type,
    threshold_value: String(rule.threshold_value ?? ""),
    benefit_id: rule.benefit_id ?? "",
    service_id: rule.service_id ?? "",
    applies_to: rule.applies_to,
    starts_at: toDateTimeLocalValue(rule.starts_at),
    ends_at: toDateTimeLocalValue(rule.ends_at),
    expires_days: rule.expires_days === null ? "" : String(rule.expires_days),
    is_repeatable: rule.is_repeatable,
    is_active: rule.is_active,
  };
}

function toBenefitFormValue(benefit: RewardBenefitRecord): RewardBenefitFormValue {
  return {
    name: benefit.name,
    description: benefit.description ?? "",
    benefit_type: benefit.benefit_type,
    service_id: benefit.service_id ?? "",
    product_id: benefit.product_id ?? "",
    voucher_amount: benefit.voucher_amount === null ? "" : String(benefit.voucher_amount),
    discount_percent: benefit.discount_percent === null ? "" : String(benefit.discount_percent),
    applies_to: benefit.applies_to,
    max_discount_amount:
      benefit.max_discount_amount === null ? "" : String(benefit.max_discount_amount),
    is_active: benefit.is_active,
  };
}

function ActionButton({
  icon,
  label,
  onClick,
}: {
  icon: typeof faGift;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button className="h-11 bg-white text-slate-700 hover:bg-slate-100" onClick={onClick}>
      <FontAwesomeIcon icon={icon} />
      {label}
    </Button>
  );
}

function SummaryCard({
  icon,
  title,
  value,
}: {
  icon: typeof faGift;
  title: string;
  value: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
        </div>
        <div className="flex size-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
          <FontAwesomeIcon icon={icon} />
        </div>
      </div>
    </section>
  );
}

export function RewardsPageClient() {
  const [bootstrap, setBootstrap] = useState<RewardsBootstrapPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingRule, setIsSavingRule] = useState(false);
  const [isSavingBenefit, setIsSavingBenefit] = useState(false);
  const [isSavingMigration, setIsSavingMigration] = useState(false);
  const [togglingRuleId, setTogglingRuleId] = useState<string | null>(null);
  const [togglingBenefitId, setTogglingBenefitId] = useState<string | null>(null);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editingBenefitId, setEditingBenefitId] = useState<string | null>(null);
  const [ruleForm, setRuleForm] = useState<RewardRuleFormValue>(createEmptyRewardRuleForm());
  const [benefitForm, setBenefitForm] =
    useState<RewardBenefitFormValue>(createEmptyRewardBenefitForm());
  const [isRuleFormModalOpen, setIsRuleFormModalOpen] = useState(false);
  const [isBenefitFormModalOpen, setIsBenefitFormModalOpen] = useState(false);
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
  const [isBenefitsModalOpen, setIsBenefitsModalOpen] = useState(false);
  const [isMigrationModalOpen, setIsMigrationModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isTutorialModalOpen, setIsTutorialModalOpen] = useState(false);
  const [migrationCustomer, setMigrationCustomer] = useState<CustomerRecord | null>(null);

  async function loadBootstrap() {
    setIsLoading(true);

    try {
      const payload = await fetchRewardsBootstrap();
      setBootstrap(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo cargar rewards.";
      console.error("[rewards/ui] Error al cargar bootstrap", { message });
      await Swal.fire({
        icon: "error",
        title: "No se pudo cargar rewards",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadBootstrap();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const role = bootstrap?.role ?? "viewer";
  const canManageCatalog = role === "owner" || role === "admin";
  const canMigrateCards = role === "owner" || role === "admin" || role === "reception";
  const activeRules = useMemo(
    () => bootstrap?.rules.filter((item) => item.is_active) ?? [],
    [bootstrap?.rules],
  );
  const activeBenefits = useMemo(
    () => bootstrap?.benefits.filter((item) => item.is_active) ?? [],
    [bootstrap?.benefits],
  );

  function openCreateRuleModal() {
    setEditingRuleId(null);
    setRuleForm(createEmptyRewardRuleForm());
    setIsRuleFormModalOpen(true);
  }

  function openEditRuleModal(rule: RewardRuleRecord) {
    setEditingRuleId(rule.id);
    setRuleForm(toRuleFormValue(rule));
    setIsRuleFormModalOpen(true);
  }

  function openCreateBenefitModal() {
    setEditingBenefitId(null);
    setBenefitForm(createEmptyRewardBenefitForm());
    setIsBenefitFormModalOpen(true);
  }

  function openEditBenefitModal(benefit: RewardBenefitRecord) {
    setEditingBenefitId(benefit.id);
    setBenefitForm(toBenefitFormValue(benefit));
    setIsBenefitFormModalOpen(true);
  }

  async function handleSaveRule() {
    if (!canManageCatalog) {
      return;
    }

    if (!ruleForm.name.trim() || !ruleForm.threshold_value.trim() || !ruleForm.benefit_id) {
      await Swal.fire({
        icon: "warning",
        title: "Faltan datos",
        text: "Completa nombre, umbral y premio.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    setIsSavingRule(true);

    try {
      await saveRewardRule(ruleForm, editingRuleId);
      await loadBootstrap();
      setIsRuleFormModalOpen(false);
      setEditingRuleId(null);
      setRuleForm(createEmptyRewardRuleForm());
      await Swal.fire({
        icon: "success",
        title: editingRuleId ? "Regla actualizada" : "Regla creada",
        text: "La regla quedo guardada.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo guardar la regla.";
      console.error("[rewards/ui] Error al guardar regla", { message });
      await Swal.fire({
        icon: "error",
        title: "No se pudo guardar la regla",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } finally {
      setIsSavingRule(false);
    }
  }

  async function handleSaveBenefit() {
    if (!canManageCatalog) {
      return;
    }

    if (!benefitForm.name.trim()) {
      await Swal.fire({
        icon: "warning",
        title: "Falta el nombre",
        text: "Completa el nombre del premio.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    setIsSavingBenefit(true);

    try {
      await saveRewardBenefit(benefitForm, editingBenefitId);
      await loadBootstrap();
      setIsBenefitFormModalOpen(false);
      setEditingBenefitId(null);
      setBenefitForm(createEmptyRewardBenefitForm());
      await Swal.fire({
        icon: "success",
        title: editingBenefitId ? "Premio actualizado" : "Premio creado",
        text: "El premio quedo guardado.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo guardar el premio.";
      console.error("[rewards/ui] Error al guardar premio", { message });
      await Swal.fire({
        icon: "error",
        title: "No se pudo guardar el premio",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } finally {
      setIsSavingBenefit(false);
    }
  }

  async function handleToggleRule(rule: RewardRuleRecord) {
    if (!canManageCatalog) {
      return;
    }

    setTogglingRuleId(rule.id);

    try {
      await saveRewardRule(
        {
          ...toRuleFormValue(rule),
          is_active: !rule.is_active,
        },
        rule.id,
      );
      await loadBootstrap();
      await Swal.fire({
        icon: "success",
        title: rule.is_active ? "Regla desactivada" : "Regla activada",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo actualizar la regla.";
      console.error("[rewards/ui] Error al cambiar estado de regla", {
        message,
        ruleId: rule.id,
      });
      await Swal.fire({
        icon: "error",
        title: "No se pudo actualizar la regla",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } finally {
      setTogglingRuleId(null);
    }
  }

  async function handleToggleBenefit(benefit: RewardBenefitRecord) {
    if (!canManageCatalog) {
      return;
    }

    setTogglingBenefitId(benefit.id);

    try {
      await saveRewardBenefit(
        {
          ...toBenefitFormValue(benefit),
          is_active: !benefit.is_active,
        },
        benefit.id,
      );
      await loadBootstrap();
      await Swal.fire({
        icon: "success",
        title: benefit.is_active ? "Premio desactivado" : "Premio activado",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo actualizar el premio.";
      console.error("[rewards/ui] Error al cambiar estado de premio", {
        message,
        benefitId: benefit.id,
      });
      await Swal.fire({
        icon: "error",
        title: "No se pudo actualizar el premio",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } finally {
      setTogglingBenefitId(null);
    }
  }

  async function handleRegisterMigration(payload: {
    customer: CustomerRecord;
    stickers: string;
    note: string;
  }) {
    if (!canMigrateCards) {
      return;
    }

    if (!payload.stickers.trim() || !payload.note.trim()) {
      await Swal.fire({
        icon: "warning",
        title: "Faltan datos",
        text: "Completa stickers y nota obligatoria.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    setIsSavingMigration(true);

    try {
      await registerRewardMigration(payload.customer.id, payload.stickers, payload.note);
      await loadBootstrap();
      setIsMigrationModalOpen(false);
      setMigrationCustomer(null);
      await Swal.fire({
        icon: "success",
        title: "Migracion registrada",
        text: "La tarjeta fisica quedo migrada con historial auditado.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo registrar la migracion.";
      console.error("[rewards/ui] Error al registrar migracion", { message });
      await Swal.fire({
        icon: "error",
        title: "No se pudo registrar la migracion",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } finally {
      setIsSavingMigration(false);
    }
  }

  if (isLoading || !bootstrap) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-600">Cargando rewards...</p>
      </section>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {canManageCatalog ? (
                <ActionButton
                  icon={faWandMagicSparkles}
                  label="Nueva regla"
                  onClick={openCreateRuleModal}
                />
              ) : null}
              {canManageCatalog ? (
                <ActionButton
                  icon={faGift}
                  label="Nuevo premio"
                  onClick={openCreateBenefitModal}
                />
              ) : null}
              {canMigrateCards ? (
                <ActionButton
                  icon={faUserPlus}
                  label="Migrar tarjeta"
                  onClick={() => {
                    setMigrationCustomer(null);
                    setIsMigrationModalOpen(true);
                  }}
                />
              ) : null}
              <ActionButton
                icon={faUsers}
                label="Ver perfil cliente"
                onClick={() => setIsProfileModalOpen(true)}
              />
              <ActionButton
                icon={faBookOpen}
                label="Tutoriales"
                onClick={() => setIsTutorialModalOpen(true)}
              />
            </div>

            <div className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
              Rol actual: {getRoleLabel(role)}
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <SummaryCard
            icon={faRotate}
            title="Reglas activas"
            value={formatRewardsNumber(bootstrap.metrics.active_rules_count)}
          />
          <SummaryCard
            icon={faTicket}
            title="Premios activos"
            value={formatRewardsNumber(bootstrap.metrics.active_benefits_count)}
          />
          <SummaryCard
            icon={faUsers}
            title="Clientes con rewards"
            value={formatRewardsNumber(bootstrap.metrics.customers_with_available_rewards)}
          />
          <SummaryCard
            icon={faUserPlus}
            title="Migraciones registradas"
            value={formatRewardsNumber(bootstrap.metrics.migrations_registered)}
          />
          <SummaryCard
            icon={faGift}
            title="Canjes del mes"
            value={formatRewardsNumber(bootstrap.metrics.redeemed_rewards_month)}
          />
          <SummaryCard
            icon={faChartLine}
            title="Atenciones del mes"
            value={formatRewardsNumber(bootstrap.metrics.accumulated_visits_month)}
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Ultimas migraciones</p>
                <p className="mt-1 text-sm text-slate-600">
                  Historial reciente de tarjetas fisicas migradas.
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {bootstrap.activity.latest_migrations.length > 0 ? (
                bootstrap.activity.latest_migrations.map((item, index) => (
                  <div
                    key={`${item.customer_id}-${item.created_at}-${index}`}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{item.customer_name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatRewardsDateTime(item.created_at)}
                        </p>
                        <p className="mt-2 text-sm text-slate-600">
                          {item.note || "Migracion manual de tarjeta fisica."}
                        </p>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-sky-700">
                        {formatRewardsNumber(item.quantity)} atenciones
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <section className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                  Aun no hay migraciones registradas.
                </section>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Ultimos canjes</p>
                <p className="mt-1 text-sm text-slate-600">
                  Rewards aplicados recientemente en ventas cerradas.
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {bootstrap.activity.latest_redemptions.length > 0 ? (
                bootstrap.activity.latest_redemptions.map((item, index) => (
                  <div
                    key={`${item.customer_id}-${item.applied_at}-${index}`}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{item.customer_name}</p>
                        <p className="mt-1 text-sm text-slate-600">{item.benefit_name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatRewardsDateTime(item.applied_at)}
                        </p>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-emerald-700">
                        {formatRewardsMoney(item.discount_amount)}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <section className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                  Aun no hay canjes registrados este periodo.
                </section>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Reglas activas resumidas</p>
                <p className="mt-1 text-sm text-slate-600">
                  Disparadores vigentes para generar beneficios.
                </p>
              </div>
              {canManageCatalog ? (
                <Button
                  className="h-9 bg-slate-100 text-slate-700 hover:bg-slate-200"
                  onClick={() => setIsRulesModalOpen(true)}
                >
                  Ver reglas
                </Button>
              ) : null}
            </div>

            <div className="mt-4 space-y-3">
              {activeRules.length > 0 ? (
                activeRules.slice(0, 4).map((rule) => (
                  <button
                    key={rule.id}
                    type="button"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-sky-200 hover:bg-sky-50"
                    onClick={() => {
                      if (canManageCatalog) {
                        openEditRuleModal(rule);
                      }
                    }}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{rule.name}</p>
                        <p className="mt-1 text-xs text-slate-500">{getRewardRuleSubtitle(rule)}</p>
                      </div>
                      <span className="text-xs font-medium text-slate-500">
                        {getRewardAppliesToLabel(rule.applies_to)}
                      </span>
                    </div>
                  </button>
                ))
              ) : (
                <section className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                  No hay reglas activas por ahora.
                </section>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Premios activos resumidos</p>
                <p className="mt-1 text-sm text-slate-600">
                  Beneficios disponibles para entrega o canje.
                </p>
              </div>
              {canManageCatalog ? (
                <Button
                  className="h-9 bg-slate-100 text-slate-700 hover:bg-slate-200"
                  onClick={() => setIsBenefitsModalOpen(true)}
                >
                  Ver premios
                </Button>
              ) : null}
            </div>

            <div className="mt-4 space-y-3">
              {activeBenefits.length > 0 ? (
                activeBenefits.slice(0, 4).map((benefit) => (
                  <button
                    key={benefit.id}
                    type="button"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-sky-200 hover:bg-sky-50"
                    onClick={() => {
                      if (canManageCatalog) {
                        openEditBenefitModal(benefit);
                      }
                    }}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{benefit.name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {getRewardBenefitSubtitle(benefit)}
                        </p>
                      </div>
                      <span className="text-xs font-medium text-slate-500">
                        {getRewardAppliesToLabel(benefit.applies_to)}
                      </span>
                    </div>
                  </button>
                ))
              ) : (
                <section className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                  No hay premios activos por ahora.
                </section>
              )}
            </div>
          </section>
        </section>
      </div>

      <RewardRulesModal
        open={isRulesModalOpen}
        rules={bootstrap.rules}
        canManage={canManageCatalog}
        togglingRuleId={togglingRuleId}
        onClose={() => setIsRulesModalOpen(false)}
        onCreate={openCreateRuleModal}
        onEdit={openEditRuleModal}
        onToggle={(rule) => {
          void handleToggleRule(rule);
        }}
      />

      <RewardBenefitsModal
        open={isBenefitsModalOpen}
        benefits={bootstrap.benefits}
        canManage={canManageCatalog}
        togglingBenefitId={togglingBenefitId}
        onClose={() => setIsBenefitsModalOpen(false)}
        onCreate={openCreateBenefitModal}
        onEdit={openEditBenefitModal}
        onToggle={(benefit) => {
          void handleToggleBenefit(benefit);
        }}
      />

      <RewardRuleFormModal
        open={isRuleFormModalOpen}
        isSaving={isSavingRule}
        isEditing={Boolean(editingRuleId)}
        value={ruleForm}
        benefits={bootstrap.benefits.map((benefit) => ({
          id: benefit.id,
          name: benefit.name,
          is_active: benefit.is_active,
        }))}
        services={bootstrap.services}
        onClose={() => setIsRuleFormModalOpen(false)}
        onChange={setRuleForm}
        onSubmit={() => {
          void handleSaveRule();
        }}
      />

      <RewardBenefitFormModal
        open={isBenefitFormModalOpen}
        isSaving={isSavingBenefit}
        isEditing={Boolean(editingBenefitId)}
        value={benefitForm}
        services={bootstrap.services}
        products={bootstrap.products}
        onClose={() => setIsBenefitFormModalOpen(false)}
        onChange={setBenefitForm}
        onSubmit={() => {
          void handleSaveBenefit();
        }}
      />

      <RewardMigrationModal
        key={`${isMigrationModalOpen ? "open" : "closed"}-${migrationCustomer?.id ?? "general"}`}
        open={isMigrationModalOpen}
        isSaving={isSavingMigration}
        initialCustomer={migrationCustomer}
        onClose={() => {
          setIsMigrationModalOpen(false);
          setMigrationCustomer(null);
        }}
        onSubmit={(payload) => {
          void handleRegisterMigration(payload);
        }}
      />

      <RewardCustomerProfileModal
        key={isProfileModalOpen ? "profile-open" : "profile-closed"}
        open={isProfileModalOpen}
        canMigrate={canMigrateCards}
        onClose={() => setIsProfileModalOpen(false)}
        onDataChanged={loadBootstrap}
        onOpenMigration={(customer) => {
          setIsProfileModalOpen(false);
          setMigrationCustomer(customer);
          setIsMigrationModalOpen(true);
        }}
      />

      <RewardsTutorialModal
        open={isTutorialModalOpen}
        onClose={() => setIsTutorialModalOpen(false)}
      />
    </>
  );
}
