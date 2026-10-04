"use client";

import { useRouter } from "next/navigation";

import { SettlementDraftForm } from "@/features/settlements/SettlementDraftForm";

export function NewSettlementPageClient() {
  const router = useRouter();
  return <div className="mx-auto max-w-xl space-y-5">
    <section><h1 className="text-2xl font-bold text-slate-950">Nueva liquidación</h1><p className="mt-1 text-slate-600">Crea un borrador y completa su detalle en la liquidación.</p></section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <SettlementDraftForm onCancel={() => router.push("/control/liquidaciones")} onCreated={(settlementId) => router.push(`/control/liquidaciones/${settlementId}`)} />
    </section>
  </div>;
}
