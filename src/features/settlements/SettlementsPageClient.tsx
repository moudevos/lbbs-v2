"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Swal from "sweetalert2";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import { formatMoney } from "@/features/pos/pos-utils";
import { SettlementDraftForm } from "@/features/settlements/SettlementDraftForm";
import { settlementStatusLabels } from "@/features/settlements/settlement-status";

type Status = "draft" | "review" | "approved" | "paid" | "cancelled";
type Row = Record<string, unknown> & { id: string; status: Status; settlement_number: string };
const numeric = (value: unknown) => Number(value ?? 0) || 0;
const statusClass: Record<Status, string> = { draft: "bg-slate-100 text-slate-700", review: "bg-amber-100 text-amber-800", approved: "bg-sky-100 text-sky-800", paid: "bg-emerald-100 text-emerald-800", cancelled: "bg-rose-100 text-rose-800" };
const relation = (value: unknown, key: string) => {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object" ? String((row as Record<string, unknown>)[key] ?? "—") : "—";
};

export function SettlementsPageClient() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const response = await fetch("/api/admin/settlements", { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        if (live) setRows(payload.data ?? []);
      } catch (error) {
        if (live) void Swal.fire({ icon: "error", title: "No se pudieron cargar liquidaciones", text: error instanceof Error ? error.message : "Error inesperado" });
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, []);

  return <div className="space-y-4">
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div><h2 className="text-lg font-bold text-slate-950">Liquidaciones quincenales</h2><p className="mt-1 text-sm text-slate-600">Las deudas se reservan en el borrador y solo se consumen al pagar. Cada liquidación continúa en su propia página.</p></div>
      <Button onClick={() => setShowNew(true)}>Nueva liquidación</Button>
    </section>
    <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4">
      <table className="min-w-[1100px] w-full text-sm"><thead className="text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="pb-3">Número</th><th className="pb-3">Empleado</th><th className="pb-3">Periodo</th><th className="pb-3">Estado</th><th className="pb-3">Producción</th><th className="pb-3">Base</th><th className="pb-3">Comisión</th><th className="pb-3">Bonos</th><th className="pb-3">Descuentos</th><th className="pb-3">Neto</th><th className="pb-3" /></tr></thead>
        <tbody>{loading ? <tr><td colSpan={11} className="py-8 text-center text-slate-500">Cargando liquidaciones…</td></tr> : rows.length === 0 ? <tr><td colSpan={11} className="py-8 text-center text-slate-500">No hay liquidaciones registradas.</td></tr> : rows.map((row) => <tr key={row.id} className="border-t border-slate-100"><td className="py-3 font-medium">{row.settlement_number}</td><td>{relation(row.employee, "full_name")}</td><td>{relation(row.period, "start_date")} al {relation(row.period, "end_date")}</td><td><span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass[row.status]}`}>{settlementStatusLabels[row.status]}</span></td><td>{formatMoney(numeric(row.recognized_production_total))}</td><td>{formatMoney(numeric(row.commissionable_base_total))}</td><td>{formatMoney(numeric(row.percentage_commission_total))}</td><td>{formatMoney(numeric(row.product_bonus_total) + numeric(row.reward_fixed_commission_total) + numeric(row.courtesy_fixed_commission_total))}</td><td>{formatMoney(numeric(row.mandatory_discount_amount) + numeric(row.debt_deduction_total) + numeric(row.other_deduction_total))}</td><td className="font-semibold">{formatMoney(numeric(row.net_pay_amount))}</td><td><Link href={`/control/liquidaciones/${row.id}`}><Button className="h-8 px-3 text-xs">{row.status === "draft" ? "Abrir borrador" : "Ver"}</Button></Link></td></tr>)}</tbody>
      </table>
    </section>
    <Modal open={showNew} title="Nueva liquidación" description="Crea el borrador y completa producción, deudas y resumen en la siguiente pantalla." onClose={() => setShowNew(false)} size="md">
      <SettlementDraftForm onCancel={() => setShowNew(false)} onCreated={(settlementId) => router.push(`/control/liquidaciones/${settlementId}`)} />
    </Modal>
  </div>;
}
