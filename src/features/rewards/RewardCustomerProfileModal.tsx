"use client";

import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/Modal";
import type { CustomerRecord } from "@/features/customers/customer-types";
import {
  fetchRewardCustomer,
  recalculateRewardCustomer,
  searchRewardCustomers,
} from "@/features/rewards/rewards-actions";
import {
  formatRewardsDateTime,
  formatRewardsMoney,
  formatRewardsNumber,
  getCustomerRewardsSummaryItems,
  getRewardMetricLabel,
  getRewardMovementLabel,
  getRewardStatusLabel,
} from "@/features/rewards/rewards-format";
import type { RewardCustomerDetail } from "@/features/rewards/rewards-types";

type RewardCustomerProfileModalProps = {
  open: boolean;
  canMigrate: boolean;
  onClose: () => void;
  onOpenMigration: (customer: CustomerRecord) => void;
  onDataChanged?: () => Promise<void> | void;
};

function getCustomerLabel(customer: CustomerRecord) {
  return customer.business_name || customer.full_name;
}

function toCustomerRecord(detail: RewardCustomerDetail): CustomerRecord | null {
  const customer = detail.customer;

  if (!customer) {
    return null;
  }

  return {
    id: customer.id,
    full_name: customer.full_name,
    first_name: customer.first_name,
    last_name: customer.last_name,
    business_name: customer.business_name,
    phone: customer.phone ?? "",
    phone_normalized: customer.phone ?? "",
    email: null,
    document_type: customer.document_type as CustomerRecord["document_type"],
    document_number: customer.document_number,
    birthdate: null,
    source: "manual",
    preferred_branch_id: null,
    preferred_branch_name: null,
    notes: null,
    is_active: customer.is_active,
    created_by: null,
    created_at: "",
    updated_at: "",
  };
}

export function RewardCustomerProfileModal({
  open,
  canMigrate,
  onClose,
  onOpenMigration,
  onDataChanged,
}: RewardCustomerProfileModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerRecord[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(null);
  const [detail, setDetail] = useState<RewardCustomerDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);

  useEffect(() => {
    if (!open || selectedCustomer || !query.trim()) {
      return;
    }

    const timer = window.setTimeout(async () => {
      setIsSearching(true);
      try {
        const nextResults = await searchRewardCustomers(query);
        setResults(nextResults);
      } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo buscar clientes.";
        console.error("[rewards/profile-modal] Error al buscar clientes", { message });
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [open, query, selectedCustomer]);

  async function loadCustomer(customer: CustomerRecord) {
    setIsLoadingDetail(true);
    setSelectedCustomer(customer);

    try {
      const nextDetail = await fetchRewardCustomer(customer.id);
      setDetail(nextDetail);
      setResults([]);
      setQuery(getCustomerLabel(customer));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo cargar el perfil rewards.";
      console.error("[rewards/profile-modal] Error al cargar perfil", {
        message,
        customerId: customer.id,
      });
      await Swal.fire({
        icon: "error",
        title: "No se pudo cargar el perfil rewards",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      setSelectedCustomer(null);
      setDetail(null);
    } finally {
      setIsLoadingDetail(false);
    }
  }

  async function handleRecalculate() {
    if (!selectedCustomer) {
      return;
    }

    setIsRecalculating(true);

    try {
      const result = await recalculateRewardCustomer(selectedCustomer.id);
      const refreshed = await fetchRewardCustomer(selectedCustomer.id);
      setDetail(refreshed);
      if (onDataChanged) {
        await onDataChanged();
      }
      await Swal.fire({
        icon: "success",
        title: "Rewards recalculados",
        text: `Se generaron ${formatRewardsNumber(result.data?.created ?? 0)} rewards faltantes para este cliente.`,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo recalcular rewards.";
      console.error("[rewards/profile-modal] Error al recalcular rewards", {
        message,
        customerId: selectedCustomer.id,
      });
      await Swal.fire({
        icon: "error",
        title: "No se pudo recalcular rewards",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } finally {
      setIsRecalculating(false);
    }
  }

  const nextRewardHint = useMemo(() => {
    if (!detail?.summary?.next_reward_name) {
      return null;
    }

    const remaining = Number(detail.summary.next_reward_remaining ?? 0);
    if (!Number.isFinite(remaining) || remaining <= 0) {
      return detail.summary.next_reward_name;
    }

    return `Faltan ${formatRewardsNumber(remaining)} atenciones para ${detail.summary.next_reward_name}.`;
  }, [detail?.summary]);

  const visibleResults = query.trim() && !selectedCustomer ? results : [];
  const availableRewards =
    detail?.entitlements.filter((item) => item.status === "available") ?? [];

  return (
    <Modal
      open={open}
      title="Ver perfil cliente"
      description="Consulta el estado de rewards de un cliente y ejecuta acciones puntuales."
      onClose={onClose}
      confirmBeforeClose={false}
      size="xl"
      footer={
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm text-slate-500">
            {selectedCustomer ? "Paso 2 de 2" : "Paso 1 de 2"}
          </div>
          <div className="flex items-center gap-2">
            {selectedCustomer ? (
              <Button
                className="bg-slate-100 text-slate-700 hover:bg-slate-200"
                onClick={() => {
                  setSelectedCustomer(null);
                  setDetail(null);
                  setQuery("");
                  setResults([]);
                }}
              >
                Cambiar cliente
              </Button>
            ) : null}
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
      {!selectedCustomer ? (
        <div className="space-y-4">
          <div>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nombre, celular o documento"
            />
          </div>

          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            {isSearching ? (
              <p className="text-sm text-slate-500">Buscando clientes...</p>
            ) : visibleResults.length > 0 ? (
              <div className="space-y-2">
                {visibleResults.map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-sky-200 hover:bg-sky-50"
                    onClick={() => {
                      void loadCustomer(customer);
                    }}
                  >
                    <p className="text-sm font-semibold text-slate-900">
                      {getCustomerLabel(customer)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {customer.document_number || "Sin documento"}
                      {" - "}
                      {customer.phone || "Sin celular"}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                {query.trim()
                  ? "No se encontraron coincidencias."
                  : "Escribe para buscar un cliente."}
              </p>
            )}
          </section>
        </div>
      ) : (
        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            {isLoadingDetail || !detail?.customer ? (
              <p className="text-sm text-slate-500">Cargando perfil rewards...</p>
            ) : (
              <>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {detail.customer.business_name || detail.customer.full_name}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {detail.customer.document_number || "Sin documento"}
                      {" - "}
                      {detail.customer.phone || "Sin celular"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canMigrate ? (
                      <Button
                        className="h-9 bg-white text-slate-700 hover:bg-slate-100"
                        onClick={() => {
                          const customer = toCustomerRecord(detail);
                          if (customer) {
                            onOpenMigration(customer);
                          }
                        }}
                      >
                        Migrar tarjeta
                      </Button>
                    ) : null}
                    <Button
                      className="h-9"
                      onClick={() => {
                        void handleRecalculate();
                      }}
                      disabled={isRecalculating}
                    >
                      {isRecalculating ? "Recalculando..." : "Recalcular rewards"}
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {getCustomerRewardsSummaryItems(detail.summary).map((item) => (
                    <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-3">
                      <p className="text-xs text-slate-500">{item.label}</p>
                      <p className="mt-1 text-base font-semibold text-slate-900">{item.value}</p>
                    </div>
                  ))}
                </div>

                {nextRewardHint ? (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    {nextRewardHint}
                  </div>
                ) : null}
              </>
            )}
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">Rewards disponibles</p>
              <div className="mt-3 space-y-2">
                {availableRewards.length > 0 ? (
                  availableRewards.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                    >
                      <p className="text-sm font-medium text-slate-900">
                        {item.reward_benefits?.name ?? "Reward disponible"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {getRewardStatusLabel(item.status)}
                        {" - "}
                        {formatRewardsDateTime(item.earned_at)}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">
                    Este cliente no tiene rewards disponibles.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">Canjes recientes</p>
              <div className="mt-3 space-y-2">
                {detail?.redemptions.length ? (
                  detail.redemptions.slice(0, 6).map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                    >
                      <p className="text-sm font-medium text-slate-900">
                        {item.reward_benefits?.name ?? "Reward aplicado"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatRewardsMoney(item.discount_amount)}
                        {" - "}
                        {formatRewardsDateTime(item.applied_at)}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">
                    Aun no hay canjes registrados para este cliente.
                  </p>
                )}
              </div>
            </section>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-slate-900">Historial reciente</p>
            <div className="mt-3 space-y-2">
              {detail?.ledger.length ? (
                detail.ledger.slice(0, 8).map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {entry.description || getRewardMetricLabel(entry.metric_type)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {getRewardMovementLabel(entry.movement_type)}
                          {" - "}
                          {formatRewardsDateTime(entry.created_at)}
                        </p>
                      </div>
                      <div className="text-right text-xs text-slate-500">
                        <p>Cantidad: {formatRewardsNumber(entry.quantity)}</p>
                        <p>Monto: {formatRewardsMoney(entry.amount)}</p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">
                  Este cliente aun no tiene movimientos de rewards.
                </p>
              )}
            </div>
          </section>
        </div>
      )}
    </Modal>
  );
}
