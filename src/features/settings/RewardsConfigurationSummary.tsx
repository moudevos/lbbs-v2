"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { faGift, faListCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { fetchRewardsBootstrap } from "@/features/rewards/rewards-actions";
import {
  getRewardBenefitSubtitle,
  getRewardRuleSubtitle,
} from "@/features/rewards/rewards-format";
import type {
  RewardBenefitRecord,
  RewardRuleRecord,
  RewardsBootstrapPayload,
} from "@/features/rewards/rewards-types";

type RewardsData = Pick<RewardsBootstrapPayload, "rules" | "benefits" | "metrics">;

function RewardList({
  title,
  icon,
  items,
  emptyText,
  getSubtitle,
}: {
  title: string;
  icon: typeof faGift;
  items: RewardRuleRecord[] | RewardBenefitRecord[];
  emptyText: string;
  getSubtitle: (item: RewardRuleRecord | RewardBenefitRecord) => string;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
          <FontAwesomeIcon icon={icon} />
        </span>
        <p className="text-sm font-semibold text-slate-900">{title}</p>
      </div>

      <div className="mt-4 space-y-2">
        {items.length > 0 ? (
          items.slice(0, 5).map((item) => (
            <div key={item.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{item.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{getSubtitle(item)}</p>
                </div>
                <span className={item.is_active ? "text-xs font-medium text-emerald-700" : "text-xs font-medium text-slate-400"}>
                  {item.is_active ? "Activa" : "Inactiva"}
                </span>
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
            {emptyText}
          </p>
        )}
      </div>
    </section>
  );
}

export function RewardsConfigurationSummary() {
  const [data, setData] = useState<RewardsData | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchRewardsBootstrap()
        .then((payload) => setData(payload))
        .catch(() => {
          console.error("[settings/rewards] No se pudo cargar el resumen de fidelizacion");
          setHasError(true);
        });
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  if (hasError) {
    return (
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        No se pudo cargar el resumen de fidelizacion.
      </section>
    );
  }

  if (!data) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">
        Cargando reglas y premios...
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">Fidelizacion de clientes</p>
          <p className="mt-1 text-sm text-slate-600">
            Las reglas indican como se gana un premio; los premios definen el beneficio que se aplica en POS.
          </p>
        </div>
        <Link
          href="/control/rewards"
          className="inline-flex h-11 items-center justify-center rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
        >
          Gestionar Rewards
        </Link>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <article className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
          <p className="text-xs text-emerald-700">Reglas activas</p>
          <p className="mt-1 text-xl font-semibold text-emerald-900">{data.metrics.active_rules_count}</p>
        </article>
        <article className="rounded-xl border border-sky-100 bg-sky-50/60 p-3">
          <p className="text-xs text-sky-700">Premios activos</p>
          <p className="mt-1 text-xl font-semibold text-sky-900">{data.metrics.active_benefits_count}</p>
        </article>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <RewardList
          title="Reglas"
          icon={faListCheck}
          items={data.rules}
          emptyText="No hay reglas registradas."
          getSubtitle={(item) => getRewardRuleSubtitle(item as RewardRuleRecord)}
        />
        <RewardList
          title="Premios"
          icon={faGift}
          items={data.benefits}
          emptyText="No hay premios registrados."
          getSubtitle={(item) => getRewardBenefitSubtitle(item as RewardBenefitRecord)}
        />
      </div>
    </section>
  );
}
