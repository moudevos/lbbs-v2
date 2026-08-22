"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/select";
import { formatMoney } from "@/features/pos/pos-utils";
import { getSettlementStatusLabel } from "@/features/settlements/settlement-status";

type Option = {
  id: string;
  name?: string;
  full_name?: string;
  start_date?: string;
  end_date?: string;
};
type Relation =
  | { name?: string; full_name?: string }
  | Array<{ name?: string; full_name?: string }>
  | null;
type ProductionRow = {
  id: string;
  employee_id: string;
  branch_id: string;
  sale_id: string;
  production_date: string;
  accounting_date: string;
  production_source:
    | "normal"
    | "reward"
    | "courtesy"
    | "commercial_discount"
    | "employee_benefit";
  quantity: number | string;
  original_line_total: number | string;
  commercial_discount_amount: number | string;
  reward_discount_amount: number | string;
  courtesy_discount_amount: number | string;
  collected_amount: number | string;
  operational_contribution_amount: number | string;
  commissionable_amount: number | string;
  fixed_commission_amount: number | string;
  status: "active" | "reversed";
  reversed_at?: string | null;
  reversed_reason?: string | null;
  employee: Relation;
  branch: Relation;
  service: Relation;
  sale?:
    | {
        status?: string;
        cancelled_at?: string | null;
        cancelled_reason?: string | null;
      }
    | Array<{
        status?: string;
        cancelled_at?: string | null;
        cancelled_reason?: string | null;
      }>
    | null;
};
type BonusRow = {
  id: string;
  employee_id: string | null;
  branch_id: string;
  sale_id: string;
  quantity: number | string;
  unit_bonus_amount: number | string;
  total_bonus_amount: number | string;
  status: string;
  employee: Relation;
  branch: Relation;
  product: Relation;
  sale_item:
    | { description_snapshot?: string; total?: number | string }
    | Array<{ description_snapshot?: string; total?: number | string }>
    | null;
};
type DebtRow = {
  id: string;
  employee_id: string;
  branch_id: string;
  debt_type: string;
  outstanding_amount: number | string;
  status: string;
  description: string | null;
  created_at: string;
  employee: Relation;
  branch: Relation;
};
type SettlementRow = {
  employee_id: string;
  commission_rate: number | string;
  percentage_commission_total: number | string;
  status: string;
};

const sourceLabels = {
  normal: "Normal",
  reward: "Reward",
  courtesy: "Cortesia",
  commercial_discount: "Descuento comercial",
  employee_benefit: "Beneficio interno",
};
const money = (value: number | string | null | undefined) => Number(value ?? 0);
const relationLabel = (value: Relation, key: "name" | "full_name") =>
  (Array.isArray(value) ? value[0]?.[key] : value?.[key]) ?? "Sin registro";
const single = <T,>(value: T | T[] | null) =>
  Array.isArray(value) ? (value[0] ?? null) : value;
const formatAccountingDate = (value: string) => {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
};

export function ProductionPageClient() {
  const [rows, setRows] = useState<ProductionRow[]>([]);
  const [bonuses, setBonuses] = useState<BonusRow[]>([]);
  const [debts, setDebts] = useState<DebtRow[]>([]);
  const [settlements, setSettlements] = useState<SettlementRow[]>([]);
  const [periods, setPeriods] = useState<Option[]>([]);
  const [branches, setBranches] = useState<Option[]>([]);
  const [employees, setEmployees] = useState<Option[]>([]);
  const [periodId, setPeriodId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [source, setSource] = useState("");
  const [productionStatus, setProductionStatus] = useState<
    "active" | "reversed" | "all"
  >("active");
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [canGenerate, setCanGenerate] = useState(true);
  const [detailEmployeeId, setDetailEmployeeId] = useState<string | null>(null);

  const loadData = useCallback(
    async (nextPeriodId = periodId) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          periodId: nextPeriodId,
          branchId,
          employeeId,
          source,
        });
        const response = await fetch(`/api/admin/production?${params}`, {
          cache: "no-store",
        });
        const payload = await response.json();
        if (!response.ok)
          throw new Error(payload.error || "No se pudo cargar la produccion.");
        setRows(payload.data ?? []);
        setBonuses(payload.bonuses ?? []);
        setDebts(payload.debts ?? []);
        setSettlements(payload.settlements ?? []);
        setPeriods(payload.filters?.periods ?? []);
        setBranches(payload.filters?.branches ?? []);
        setEmployees(payload.filters?.employees ?? []);
        setCanGenerate(payload.permissions?.canGenerate !== false);
        if (!nextPeriodId && payload.selectedPeriodId)
          setPeriodId(payload.selectedPeriodId);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "No se pudo cargar la produccion.";
        console.error("[production/ui] Error al cargar", { message });
        await Swal.fire({
          icon: "error",
          title: "No se pudo cargar la produccion",
          text: message,
          confirmButtonColor: "#0f766e",
        });
      } finally {
        setIsLoading(false);
      }
    },
    [branchId, employeeId, periodId, source],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const activeRows = rows.filter((row) => row.status === "active");
  const activeBonuses = bonuses.filter(
    (row) => row.status === "active" || row.status === "pending_review",
  );
  const summary = useMemo(
    () => ({
      services: activeRows.reduce((sum, row) => sum + money(row.quantity), 0),
      serviceGross: activeRows.reduce(
        (sum, row) => sum + money(row.original_line_total),
        0,
      ),
      contribution: activeRows.reduce(
        (sum, row) => sum + money(row.operational_contribution_amount),
        0,
      ),
      base: activeRows.reduce(
        (sum, row) => sum + money(row.commissionable_amount),
        0,
      ),
      products: activeBonuses.reduce(
        (sum, row) => sum + money(row.quantity),
        0,
      ),
      productGross: activeBonuses.reduce(
        (sum, row) => sum + money(single(row.sale_item)?.total),
        0,
      ),
      bonuses: activeBonuses.reduce(
        (sum, row) => sum + money(row.total_bonus_amount),
        0,
      ),
      rewards: activeRows
        .filter((row) => row.production_source === "reward")
        .reduce((sum, row) => sum + money(row.quantity), 0),
      rewardFixed: activeRows
        .filter((row) => row.production_source === "reward")
        .reduce((sum, row) => sum + money(row.fixed_commission_amount), 0),
      debts: debts.reduce(
        (sum, debt) => sum + money(debt.outstanding_amount),
        0,
      ),
    }),
    [activeBonuses, activeRows, debts],
  );

  const employeeSummaries = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        branch: string;
        services: number;
        gross: number;
        contribution: number;
        base: number;
        products: number;
        productGross: number;
        bonuses: number;
        rewards: number;
        rewardFixed: number;
        debt: number;
        settlement: SettlementRow | null;
      }
    >();
    const emptySummary = (id: string, name: string, branch: string) => ({
      id,
      name,
      branch,
      services: 0,
      gross: 0,
      contribution: 0,
      base: 0,
      products: 0,
      productGross: 0,
      bonuses: 0,
      rewards: 0,
      rewardFixed: 0,
      debt: 0,
      settlement: null,
    });
    for (const row of activeRows) {
      const current =
        map.get(row.employee_id) ??
        emptySummary(
          row.employee_id,
          relationLabel(row.employee, "full_name"),
          relationLabel(row.branch, "name"),
        );
      current.services += money(row.quantity);
      current.gross += money(row.original_line_total);
      current.contribution += money(row.operational_contribution_amount);
      current.base += money(row.commissionable_amount);
      if (row.production_source === "reward") {
        current.rewards += money(row.quantity);
        current.rewardFixed += money(row.fixed_commission_amount);
      }
      map.set(row.employee_id, current);
    }
    for (const bonus of activeBonuses)
      if (bonus.employee_id) {
        const current = map.get(bonus.employee_id);
        if (current) {
          current.products += money(bonus.quantity);
          current.productGross += money(single(bonus.sale_item)?.total);
          current.bonuses += money(bonus.total_bonus_amount);
        }
      }
    for (const debt of debts) {
      const current =
        map.get(debt.employee_id) ??
        emptySummary(
          debt.employee_id,
          relationLabel(debt.employee, "full_name"),
          relationLabel(debt.branch, "name"),
        );
      current.debt += money(debt.outstanding_amount);
      map.set(debt.employee_id, current);
    }
    for (const settlement of settlements) {
      const current = map.get(settlement.employee_id);
      if (current) current.settlement = settlement;
    }
    return Array.from(map.values());
  }, [activeBonuses, activeRows, debts, settlements]);

  const selected =
    employeeSummaries.find((item) => item.id === detailEmployeeId) ?? null;
  const selectedServices = rows.filter(
    (row) =>
      row.employee_id === detailEmployeeId &&
      (productionStatus === "all" || row.status === productionStatus),
  );
  const selectedProducts = activeBonuses.filter(
    (row) => row.employee_id === detailEmployeeId,
  );
  const selectedDebts = debts.filter(
    (row) => row.employee_id === detailEmployeeId,
  );

  async function generateProduction() {
    if (!periodId) return;
    const confirmation = await Swal.fire({
      icon: "question",
      title: "Generar produccion del periodo",
      text: "Se procesaran solo ventas faltantes o que requieran reversion.",
      showCancelButton: true,
      confirmButtonText: "Generar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#0f766e",
    });
    if (!confirmation.isConfirmed) return;
    setIsGenerating(true);
    try {
      const response = await fetch("/api/admin/production", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodId, branchId: branchId || null }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      await loadData(periodId);
      await Swal.fire({
        icon: "success",
        title: "Produccion actualizada",
        text: `Ventas revisadas: ${payload.data?.sales_reviewed ?? 0}. Servicios: ${payload.data?.services_generated ?? 0}. Bonos: ${payload.data?.bonuses_generated ?? 0}.`,
        confirmButtonColor: "#0f766e",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo generar.";
      console.error("[production/ui] Error al generar", { message });
      await Swal.fire({
        icon: "error",
        title: "No se pudo generar",
        text: message,
        confirmButtonColor: "#0f766e",
      });
    } finally {
      setIsGenerating(false);
    }
  }

  const metricCards = [
    ["Servicios realizados", String(summary.services)],
    ["Bruto de servicios", formatMoney(summary.serviceGross)],
    ["Aportes operativos", formatMoney(summary.contribution)],
    ["Base comisionable", formatMoney(summary.base)],
    ["Productos vendidos", String(summary.products)],
    ["Bruto de productos", formatMoney(summary.productGross)],
    ["Bonos generados", formatMoney(summary.bonuses)],
    ["Rewards ejecutados", String(summary.rewards)],
    ["Comision fija rewards", formatMoney(summary.rewardFixed)],
    ["Deuda vigente total", formatMoney(summary.debts)],
    [
      "Registros revertidos",
      String(rows.filter((row) => row.status === "reversed").length),
    ],
  ];

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <p className="shrink-0 text-sm font-semibold text-slate-900">
            Control de produccion
          </p>

          <div className="grid flex-1 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <Select
              value={periodId}
              onChange={(event) => setPeriodId(event.target.value)}
            >
              <option value="">Periodo</option>
              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.start_date} al {period.end_date}
                </option>
              ))}
            </Select>
            <Select
              value={branchId}
              onChange={(event) => setBranchId(event.target.value)}
            >
              <option value="">Todas las sedes</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </Select>
            <Select
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
            >
              <option value="">Todos los empleados</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name}
                </option>
              ))}
            </Select>
            <Select
              value={source}
              onChange={(event) => setSource(event.target.value)}
            >
              <option value="">Todos los origenes</option>
              {Object.entries(sourceLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Select
              value={productionStatus}
              onChange={(event) =>
                setProductionStatus(
                  event.target.value as "active" | "reversed" | "all",
                )
              }
            >
              <option value="active">Activas</option>
              <option value="reversed">Revertidas</option>
              <option value="all">Todas</option>
            </Select>
          </div>

          {canGenerate ? (
            <Button
              type="button"
              className="shrink-0"
              disabled={!periodId || isGenerating}
              onClick={() => void generateProduction()}
            >
              {isGenerating ? "Generando..." : "Generar produccion"}
            </Button>
          ) : null}
        </div>
      </section>

      <section className="flex flex-nowrap gap-2 overflow-x-auto pb-1">
        {metricCards.map(([label, value]) => (
          <article
            key={label}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2.5"
          >
            <p className="text-[11px] text-slate-500">{label}</p>
            <p className="mt-1 text-base font-semibold text-slate-900">
              {value}
            </p>
          </article>
        ))}
      </section>
      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <table className="min-w-[1100px] w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Empleado</th>
              <th className="px-3 py-2.5 font-semibold">Sede</th>
              <th className="px-3 py-2.5 text-center font-semibold">
                Servicios
              </th>
              <th className="px-3 py-2.5 text-center font-semibold">
                Bruto servicios
              </th>
              <th className="px-3 py-2.5 text-center font-semibold">Aporte</th>
              <th className="px-3 py-2.5 text-center font-semibold">Base</th>
              <th className="px-3 py-2.5 text-center font-semibold">
                Productos
              </th>
              <th className="px-3 py-2.5 text-center font-semibold">Bonos</th>
              <th className="px-3 py-2.5 text-center font-semibold">Rewards</th>
              <th className="px-3 py-2.5 text-center font-semibold">
                Deuda vigente
              </th>
              <th className="px-3 py-2.5 font-semibold">Liquidacion</th>
              <th className="px-3 py-2.5 text-right font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr>
                <td colSpan={12} className="py-8 text-center text-slate-500">
                  Cargando produccion...
                </td>
              </tr>
            ) : (
              employeeSummaries.map((item) => {
                const settlementStyles: Record<
                  string,
                  { badge: string; dot: string }
                > = {
                  draft: {
                    badge: "bg-slate-100 text-slate-600",
                    dot: "bg-slate-400",
                  },
                  review: {
                    badge: "bg-amber-50 text-amber-700",
                    dot: "bg-amber-500",
                  },
                  approved: {
                    badge: "bg-sky-50 text-sky-700",
                    dot: "bg-sky-500",
                  },
                  paid: {
                    badge: "bg-emerald-50 text-emerald-700",
                    dot: "bg-emerald-500",
                  },
                  cancelled: {
                    badge: "bg-rose-50 text-rose-700",
                    dot: "bg-rose-500",
                  },
                };
                const settlementStyle = item.settlement
                  ? (settlementStyles[item.settlement.status] ??
                    settlementStyles.draft)
                  : null;

                return (
                  <tr key={item.id} className="transition hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-medium text-slate-900">
                      {item.name}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">
                      {item.branch}
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-slate-700">
                      {item.services}
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-slate-700">
                      {formatMoney(item.gross)}
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-slate-700">
                      {formatMoney(item.contribution)}
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums font-semibold text-slate-900">
                      {formatMoney(item.base)}
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-slate-700">
                      {item.products}
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-slate-700">
                      {formatMoney(item.bonuses)}
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-slate-700">
                      {item.rewards}
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-rose-700">
                      {formatMoney(item.debt)}
                    </td>
                    <td className="px-3 py-2.5">
                      {item.settlement && settlementStyle ? (
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${settlementStyle.badge}`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${settlementStyle.dot}`}
                          />
                          {getSettlementStatusLabel(item.settlement.status)}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">
                          Pendiente de porcentaje
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Button
                        type="button"
                        className="h-8 border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm transition hover:border-amber-200 hover:bg-amber-50 hover:text-amber-800"
                        onClick={() => setDetailEmployeeId(item.id)}
                      >
                        Ver detalle
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
      <Modal
        open={detailEmployeeId !== null}
        title="Detalle de produccion"
        description={selected ? `${selected.name} - ${selected.branch}` : ""}
        onClose={() => setDetailEmployeeId(null)}
        confirmBeforeClose={false}
        size="xl"
      >
        <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
          {selected ? (
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["Servicios", selected.services],
                ["Bruto servicios", formatMoney(selected.gross)],
                ["Aporte operativo", formatMoney(selected.contribution)],
                ["Base", formatMoney(selected.base)],
                ["Productos", selected.products],
                ["Bruto productos", formatMoney(selected.productGross)],
                ["Bonos", formatMoney(selected.bonuses)],
                ["Rewards", selected.rewards],
                ["Comision fija rewards", formatMoney(selected.rewardFixed)],
                ["Deuda vigente total", formatMoney(selected.debt)],
                [
                  "Total estimado",
                  selected.settlement
                    ? formatMoney(
                        money(selected.settlement.percentage_commission_total) +
                          selected.rewardFixed +
                          selected.bonuses,
                      )
                    : "Pendiente de porcentaje",
                ],
              ].map(([label, value]) => (
                <article
                  key={String(label)}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                >
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {value}
                  </p>
                </article>
              ))}
            </section>
          ) : null}
          <section>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">
                Deudas vigentes acumuladas
              </p>
              <p className="text-xs text-slate-500">
                No dependen del período seleccionado.
              </p>
            </div>
            <div className="space-y-2">
              {selectedDebts.length ? (
                selectedDebts.map((debt) => (
                  <article
                    key={debt.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-rose-100 bg-rose-50/50 px-3 py-2 text-sm"
                  >
                    <span>{debt.description || debt.debt_type}</span>
                    <strong className="tabular-nums text-rose-700">
                      {formatMoney(money(debt.outstanding_amount))}
                    </strong>
                  </article>
                ))
              ) : (
                <p className="text-sm text-slate-500">Sin deuda vigente.</p>
              )}
            </div>
          </section>
          <section>
            <p className="mb-2 text-sm font-semibold text-slate-900">
              Servicios del periodo
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th>Fecha contable</th>
                    <th>Venta</th>
                    <th>Servicio</th>
                    <th>Origen</th>
                    <th className="text-right">Bruto</th>
                    <th className="text-right">Descuentos</th>
                    <th className="text-right">Cobrado</th>
                    <th className="text-right">Aporte</th>
                    <th className="text-right">Base</th>
                    <th className="text-right">Fija</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedServices.map((row) => (
                    <tr key={row.id}>
                      <td className="py-2">
                        {formatAccountingDate(row.accounting_date)}
                      </td>
                      <td>VTA-{row.sale_id.slice(0, 8).toUpperCase()}</td>
                      <td>{relationLabel(row.service, "name")}</td>
                      <td>{sourceLabels[row.production_source]}</td>
                      <td className="text-right">
                        {formatMoney(money(row.original_line_total))}
                      </td>
                      <td className="text-right">
                        {formatMoney(
                          money(row.commercial_discount_amount) +
                            money(row.reward_discount_amount) +
                            money(row.courtesy_discount_amount),
                        )}
                      </td>
                      <td className="text-right">
                        {formatMoney(money(row.collected_amount))}
                      </td>
                      <td className="text-right">
                        {formatMoney(
                          money(row.operational_contribution_amount),
                        )}
                      </td>
                      <td className="text-right">
                        {formatMoney(money(row.commissionable_amount))}
                      </td>
                      <td className="text-right">
                        {formatMoney(money(row.fixed_commission_amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section>
            <p className="mb-2 text-sm font-semibold text-slate-900">
              Productos y bonos
            </p>
            <div className="space-y-2">
              {selectedProducts.length ? (
                selectedProducts.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 text-sm"
                  >
                    <span>
                      {relationLabel(row.product, "name")} x
                      {money(row.quantity)}
                    </span>
                    <span>
                      Bruto {formatMoney(money(single(row.sale_item)?.total))} -
                      Bono {formatMoney(money(row.total_bonus_amount))}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">
                  Sin bonos de productos en este periodo.
                </p>
              )}
            </div>
          </section>
        </div>
      </Modal>
    </div>
  );
}
