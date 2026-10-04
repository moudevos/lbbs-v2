"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/features/pos/pos-utils";

export type SettlementDebtSource = { sale_reference?: string | null; first_item_description?: string | null; extra_item_count?: number | string | null; source_description?: string | null };
export type SettlementDebt = {
  debt_id: string; debt_date: string; debt_type: string; debt_label: string; description: string; origin_label: string;
  outstanding_amount: number | string; active_reserved_amount: number | string; available_debt_amount: number | string; source?: SettlementDebtSource | null;
};
type Props = {
  debts: SettlementDebt[]; amounts: Record<string, string>; totals: Record<string, boolean>;
  maximumAmounts?: Record<string, number>; remainingDebtCapacity?: number;
  onAmount: (debt: SettlementDebt, value: string) => void;
  onTotal: (debt: SettlementDebt, checked: boolean) => void;
  onWaive?: (debt: SettlementDebt) => void;
  readOnly?: boolean;
};
const money = (value: unknown) => Number(value ?? 0) || 0;

export function SettlementDebtSelection({ debts, amounts, totals, maximumAmounts = {}, remainingDebtCapacity, onAmount, onTotal, onWaive, readOnly = false }: Props) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div><h2 className="font-bold text-slate-950">Deudas aplicadas</h2><p className="mt-1 text-sm text-slate-500">Las selecciones reservan saldo; solo el pago de la liquidación lo consume.</p></div>
    <div className="mt-4 overflow-x-auto"><table className="min-w-[1180px] w-full text-sm"><thead className="text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="pb-3 pr-4">Fecha</th><th className="pb-3 pr-4">Deuda / descripción</th><th className="pb-3 pr-4">Origen</th><th className="pb-3 pr-4 text-right">Saldo</th><th className="pb-3 pr-4 text-right">Reservado</th><th className="pb-3 pr-4 text-right">Disponible</th><th className="pb-3 pr-4 text-center">Total</th><th className="pb-3 pr-4">Monto a descontar</th><th className="pb-3 text-center">Acción</th></tr></thead>
      <tbody>{debts.map((debt) => {
        const available = money(debt.available_debt_amount); const total = Boolean(totals[debt.debt_id]); const amount = amounts[debt.debt_id] ?? "";
        const maximum = money(maximumAmounts[debt.debt_id] ?? available); const invalid = money(amount) > maximum; const isPos = debt.debt_type === "internal_credit" || debt.debt_type === "supply";
        const description = isPos ? debt.source?.first_item_description || debt.source?.source_description || debt.description : debt.description;
        const extraItems = Number(debt.source?.extra_item_count ?? 0);
        return <tr key={debt.debt_id} className="border-t border-slate-100"><td className="whitespace-nowrap py-3 pr-4 align-top">{new Date(debt.debt_date).toLocaleDateString("es-PE")}</td><td className="max-w-[320px] py-3 pr-4 align-top"><strong className="block">{isPos ? "Consumo POS" : debt.debt_label}</strong><span className="block whitespace-normal text-xs text-slate-600">{description}</span>{extraItems > 0 ? <span className="block text-xs text-slate-500">+ {extraItems} items más</span> : null}{debt.source?.sale_reference ? <span className="block text-xs font-medium text-slate-500">Venta {debt.source.sale_reference}</span> : null}</td><td className="max-w-[220px] whitespace-normal py-3 pr-4 align-top">{debt.origin_label}</td><td className="whitespace-nowrap py-3 pr-4 text-right">{formatMoney(money(debt.outstanding_amount))}</td><td className="whitespace-nowrap py-3 pr-4 text-right">{money(debt.active_reserved_amount) ? formatMoney(money(debt.active_reserved_amount)) : "—"}</td><td className="whitespace-nowrap py-3 pr-4 text-right font-semibold text-emerald-700">{formatMoney(available)}</td><td className="whitespace-nowrap py-3 pr-4 text-center"><label className="inline-flex items-center gap-2"><input type="checkbox" checked={total} disabled={readOnly || maximum <= 0} onChange={(event) => onTotal(debt, event.target.checked)} /><span>Total</span></label>{total && money(amount) < available ? <span className="block pt-1 text-xs text-amber-700">Aplicado hasta el máximo disponible de la liquidación.</span> : null}</td><td className="w-52 py-3 pr-4"><Input className={invalid ? "h-9 border-rose-500" : "h-9"} type="number" min="0" step="0.01" value={amount} disabled={readOnly || total || available <= 0} placeholder="Monto parcial" onChange={(event) => onAmount(debt, event.target.value)} />{invalid ? <span className="block pt-1 text-xs text-rose-700">Solo puedes descontar hasta {formatMoney(maximum)} en esta deuda.{remainingDebtCapacity !== undefined ? <><span> </span>Quedan {formatMoney(remainingDebtCapacity)} adicionales en esta liquidación.</> : null}</span> : null}</td><td className="whitespace-nowrap py-3 text-center">{!readOnly && onWaive && debt.debt_type === "penalty" ? <Button className="h-8 bg-rose-50 px-2 text-xs text-rose-700 hover:bg-rose-100" onClick={() => onWaive(debt)}>Sin efecto</Button> : <span className="text-slate-300">—</span>}</td></tr>;
      })}</tbody>
    </table></div>
  </section>;
}
