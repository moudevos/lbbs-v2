"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { RewardCustomerProfileModal } from "@/features/rewards/RewardCustomerProfileModal";

export function RewardsCustomerProfilePageClient({ canMigrate }: { canMigrate: boolean }) {
  const router = useRouter();
  return <section className="space-y-4"><div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold text-slate-900">Perfil Rewards de cliente</h2><p className="mt-1 text-sm text-slate-600">Consulta atenciones, premios y movimientos de un cliente.</p></div><Link href="/control/rewards" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Volver a Rewards</Link></div><RewardCustomerProfileModal open canMigrate={canMigrate} onClose={() => router.push("/control/rewards")} onDataChanged={() => router.refresh()} onOpenMigration={() => router.push("/control/rewards")} /></section>;
}
