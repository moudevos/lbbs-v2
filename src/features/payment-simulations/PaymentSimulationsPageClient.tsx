"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { calculatePaymentSimulation } from "@/features/payment-simulations/payment-simulation-calculator";
import { formatMoney } from "@/features/pos/pos-utils";

type Employee = {
  id: string;
  full_name: string;
  branch_id?: string | null;
};

type Period = {
  id: string;
  start_date: string;
  end_date: string;
  status?: string;
};

type Debt = {
  id: string;
  debt_type: string;
  description: string | null;
  outstanding_amount: number | string;
  status: string;
  created_at: string;
  branch:
    | { name?: string }
    | Array<{ name?: string }>
    | null;
};

type SystemReference = {
  employeeId: string;
  employeeName: string;
  periodId: string;
  totalProduced: number;
  commissionableBase: number;
  commissionRate: number | null;
  additionalIncome: number;
  mandatoryDiscountEnabled: boolean;
  mandatoryDiscountRate: number;
  livePendingSales: number;
  sourceSettlement: { id: string; status: string } | null;
};

const debtTypeLabels: Record<string, string> = {
  loan: "Préstamo",
  advance: "Adelanto",
  supply: "Insumo",
  internal_credit: "Crédito interno",
  penalty: "Penalidad",
  administrative_charge: "Cargo administrativo",
  other: "Otro cargo",
};

const numeric = (value: string | number | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const relationName = (value: Debt["branch"]) =>
  (Array.isArray(value) ? value[0]?.name : value?.name) ?? "Sin sede";

const formatPeriod = (period: Period) =>
  `${period.start_date.split("-").reverse().join("/")} - ${period.end_date
    .split("-")
    .reverse()
    .join("/")}`;

export function PaymentSimulationsPageClient() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [system, setSystem] = useState<SystemReference | null>(null);
  const [availableDebts, setAvailableDebts] = useState<Debt[]>([]);
  const [selectedDebts, setSelectedDebts] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingReference, setIsLoadingReference] = useState(false);

  const [totalProduced, setTotalProduced] = useState("");
  const [commissionableBase, setCommissionableBase] = useState("");
  const [commissionRate, setCommissionRate] = useState("");
  const [additionalIncome, setAdditionalIncome] = useState("0");
  const [mandatoryDiscountEnabled, setMandatoryDiscountEnabled] = useState(true);
  const [mandatoryDiscountRate, setMandatoryDiscountRate] = useState("1");
  const [manualDebtAmount, setManualDebtAmount] = useState("0");
  const [otherDeductions, setOtherDeductions] = useState("0");

  const clearManualValues = useCallback(() => {
    setTotalProduced("");
    setCommissionableBase("");
    setCommissionRate("");
    setAdditionalIncome("0");
    setMandatoryDiscountEnabled(true);
    setMandatoryDiscountRate("1");
    setManualDebtAmount("0");
    setOtherDeductions("0");
    setSelectedDebts({});
  }, []);

  const applySystemReference = useCallback((reference: SystemReference) => {
    setTotalProduced(String(reference.totalProduced));
    setCommissionableBase(String(reference.commissionableBase));
    setCommissionRate(
      reference.commissionRate === null ? "" : String(reference.commissionRate),
    );
    setAdditionalIncome(String(reference.additionalIncome));
    setMandatoryDiscountEnabled(reference.mandatoryDiscountEnabled);
    setMandatoryDiscountRate(String(reference.mandatoryDiscountRate));
    setOtherDeductions("0");
    setSelectedDebts({});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    void fetch("/api/admin/payment-simulations", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok)
          throw new Error(payload.error || "No se pudo cargar la simulación.");
        if (cancelled) return;
        setEmployees(payload.employees ?? []);
        setPeriods(payload.periods ?? []);
        setPeriodId(payload.selectedPeriodId ?? "");
      })
      .catch((error) => {
        console.error("[payment-simulations/ui] Error inicial", {
          message: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!employeeId) {
      setSystem(null);
      setAvailableDebts([]);
      clearManualValues();
      return;
    }
    if (!periodId) return;

    const controller = new AbortController();
    setIsLoadingReference(true);

    const params = new URLSearchParams({ employeeId, periodId });
    void fetch(`/api/admin/payment-simulations?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok)
          throw new Error(
            payload.error || "No se pudieron cargar los valores del sistema.",
          );

        const reference = payload.system as SystemReference | null;
        setEmployees(payload.employees ?? []);
        setPeriods(payload.periods ?? []);
        setAvailableDebts(payload.debts ?? []);
        setSystem(reference);
        if (reference) applySystemReference(reference);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error("[payment-simulations/ui] Error al cargar referencia", {
          message: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingReference(false);
      });

    return () => controller.abort();
  }, [applySystemReference, clearManualValues, employeeId, periodId]);

  const selectedDebtTotal = useMemo(
    () =>
      availableDebts.reduce((sum, debt) => {
        const entered = selectedDebts[debt.id];
        if (entered === undefined) return sum;
        return (
          sum +
          Math.min(
            Math.max(0, numeric(entered)),
            Math.max(0, numeric(debt.outstanding_amount)),
          )
        );
      }, 0),
    [availableDebts, selectedDebts],
  );

  const debtAmount = employeeId
    ? selectedDebtTotal
    : Math.max(0, numeric(manualDebtAmount));

  const result = useMemo(
    () =>
      calculatePaymentSimulation({
        totalProduced: numeric(totalProduced),
        commissionableBase: numeric(commissionableBase),
        commissionRate: numeric(commissionRate),
        additionalIncome: numeric(additionalIncome),
        mandatoryDiscountEnabled,
        mandatoryDiscountRate: numeric(mandatoryDiscountRate),
        debtAmount,
        otherDeductions: numeric(otherDeductions),
      }),
    [
      additionalIncome,
      commissionRate,
      commissionableBase,
      debtAmount,
      mandatoryDiscountEnabled,
      mandatoryDiscountRate,
      otherDeductions,
      totalProduced,
    ],
  );

  const selectedEmployee = employees.find(
    (employee) => employee.id === employeeId,
  );
  const selectedPeriod = periods.find((period) => period.id === periodId);

  const setDebtSelected = (debt: Debt, checked: boolean) => {
    setSelectedDebts((current) => {
      const next = { ...current };
      if (checked) next[debt.id] = String(numeric(debt.outstanding_amount));
      else delete next[debt.id];
      return next;
    });
  };

  const updateDebtAmount = (debt: Debt, value: string) => {
    const limit = Math.max(0, numeric(debt.outstanding_amount));
    const amount = Math.min(Math.max(0, numeric(value)), limit);
    setSelectedDebts((current) => ({
      ...current,
      [debt.id]: value === "" ? "" : String(amount),
    }));
  };

  const referenceText = (value: number, suffix = "") =>
    system ? `Sistema: ${suffix}${value.toFixed(2)}` : "Ingreso manual";

  const cards = [
    {
      label: "Total producido",
      value: result.totalProduced,
      detail: "Servicios + productos atribuidos",
      className: "bg-white",
      amountClassName: "text-slate-950",
    },
    {
      label: "Base comisionable",
      value: result.commissionableBase,
      detail: "Base sobre la que se aplica la comisión",
      className: "bg-white",
      amountClassName: "text-slate-950",
    },
    {
      label: "Bruto a cobrar",
      value: result.grossPay,
      detail: `Comisión ${formatMoney(result.commission)} + adicionales`,
      className: "bg-white",
      amountClassName: "text-slate-950",
    },
    {
      label: "Descuento obligatorio",
      value: -result.mandatoryDiscount,
      detail: mandatoryDiscountEnabled
        ? `${result.mandatoryDiscountRate.toFixed(2)} % sobre total producido`
        : "Desactivado",
      className: "bg-rose-50/50",
      amountClassName: "text-rose-700",
    },
    {
      label: "Deudas aplicadas",
      value: -result.debtApplied,
      detail:
        result.debtRequested > result.debtApplied
          ? `Solicitado: ${formatMoney(result.debtRequested)}`
          : employeeId
            ? "Deudas seleccionadas"
            : "Monto manual",
      className: "bg-amber-50/50",
      amountClassName: "text-amber-800",
    },
    {
      label: "Neto estimado",
      value: result.estimatedNet,
      detail: "Resultado de esta simulación",
      className: "bg-emerald-50",
      amountClassName: "text-emerald-700",
    },
  ];

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-sky-200 bg-sky-50/70 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-950">
              Simulación de liquidación
            </p>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              Contrasta las cuentas del barbero con recepción. Puedes cargar
              valores reales del sistema y editarlos libremente. Nada de esta
              pantalla crea liquidaciones, consume deudas ni afecta caja o P&amp;L.
            </p>
          </div>
          <span className="rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-semibold text-sky-700">
            Solo simulación
          </span>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <p className="text-sm font-semibold text-slate-950">
            Contexto de comparación
          </p>
          <p className="mt-1 text-xs text-slate-500">
            El personal es opcional. Sin personal seleccionado todos los
            importes se ingresan manualmente.
          </p>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_1.35fr_auto]">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-slate-600">Período</span>
            <Select
              value={periodId}
              disabled={isLoading}
              onChange={(event) => setPeriodId(event.target.value)}
            >
              <option value="">Seleccionar período</option>
              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {formatPeriod(period)}
                </option>
              ))}
            </Select>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-medium text-slate-600">
              Personal opcional
            </span>
            <Select
              value={employeeId}
              disabled={isLoading}
              onChange={(event) => setEmployeeId(event.target.value)}
            >
              <option value="">Sin personal · ingreso 100 % manual</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name}
                </option>
              ))}
            </Select>
          </label>

          <div className="flex items-end">
            <Button
              type="button"
              className="w-full lg:w-auto"
              disabled={!system || isLoadingReference}
              onClick={() => system && applySystemReference(system)}
            >
              Restaurar sistema
            </Button>
          </div>
        </div>

        {employeeId ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {isLoadingReference ? (
              "Cargando producción, configuración y deudas…"
            ) : system ? (
              <>
                Referencia cargada para{" "}
                <strong className="text-slate-900">
                  {selectedEmployee?.full_name ?? system.employeeName}
                </strong>
                {selectedPeriod ? ` · ${formatPeriod(selectedPeriod)}` : ""}.
                {system.livePendingSales > 0 ? (
                  <>
                    {" "}
                    Incluye{" "}
                    <strong className="text-sky-700">
                      {system.livePendingSales} venta(s) en vivo
                    </strong>{" "}
                    aún no consolidadas.
                  </>
                ) : null}
              </>
            ) : (
              "No se pudo cargar una referencia del sistema."
            )}
          </div>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50/70 px-5 py-3">
          <p className="text-sm font-semibold text-slate-950">
            Resumen de la simulación
          </p>
        </div>
        <div className="grid gap-px bg-slate-200 sm:grid-cols-2 xl:grid-cols-6">
          {cards.map((card) => (
            <article
              key={card.label}
              className={`min-h-[116px] px-4 py-4 ${card.className}`}
            >
              <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                {card.label}
              </span>
              <strong
                className={`mt-2 block text-xl font-bold tabular-nums tracking-tight ${card.amountClassName}`}
              >
                {formatMoney(card.value)}
              </strong>
              <span className="mt-1.5 block text-xs leading-4 text-slate-500">
                {card.detail}
              </span>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <p className="text-sm font-semibold text-slate-950">
              Valores de cálculo
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Los campos cargados desde el sistema siguen siendo editables para
              contrastar las cuentas externas.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-slate-600">
                Total producido
              </span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={totalProduced}
                onChange={(event) => setTotalProduced(event.target.value)}
                placeholder="0.00"
              />
              <span className="block text-[11px] text-slate-400">
                {referenceText(system?.totalProduced ?? 0, "S/ ")}
              </span>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium text-slate-600">
                Base comisionable
              </span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={commissionableBase}
                onChange={(event) => setCommissionableBase(event.target.value)}
                placeholder="0.00"
              />
              <span className="block text-[11px] text-slate-400">
                {referenceText(system?.commissionableBase ?? 0, "S/ ")}
              </span>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium text-slate-600">
                % de comisión
              </span>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={commissionRate}
                onChange={(event) => setCommissionRate(event.target.value)}
                placeholder="0.00"
              />
              <span className="block text-[11px] text-slate-400">
                {system
                  ? system.commissionRate === null
                    ? "Sin % configurado · ingrésalo manualmente"
                    : `Sistema: ${system.commissionRate.toFixed(2)} %`
                  : "Ingreso manual"}
              </span>
            </label>

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-slate-600">
                Comisión calculada
              </span>
              <div className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-semibold tabular-nums text-slate-900">
                {formatMoney(result.commission)}
              </div>
              <span className="block text-[11px] text-slate-400">
                Base comisionable × porcentaje
              </span>
            </div>

            <label className="space-y-1.5">
              <span className="text-xs font-medium text-slate-600">
                Bonos / otros ingresos
              </span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={additionalIncome}
                onChange={(event) => setAdditionalIncome(event.target.value)}
                placeholder="0.00"
              />
              <span className="block text-[11px] text-slate-400">
                {referenceText(system?.additionalIncome ?? 0, "S/ ")}
              </span>
            </label>

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-slate-600">
                Bruto a cobrar
              </span>
              <div className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-semibold tabular-nums text-slate-900">
                {formatMoney(result.grossPay)}
              </div>
              <span className="block text-[11px] text-slate-400">
                Comisión + bonos / otros ingresos
              </span>
            </div>

            <label className="space-y-1.5">
              <span className="flex items-center justify-between gap-2 text-xs font-medium text-slate-600">
                <span>% descuento obligatorio</span>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-normal text-slate-500">
                  <input
                    type="checkbox"
                    checked={mandatoryDiscountEnabled}
                    onChange={(event) =>
                      setMandatoryDiscountEnabled(event.target.checked)
                    }
                  />
                  Aplicar
                </span>
              </span>
              <Input
                type="number"
                min="0"
                step="0.01"
                disabled={!mandatoryDiscountEnabled}
                value={mandatoryDiscountRate}
                onChange={(event) =>
                  setMandatoryDiscountRate(event.target.value)
                }
                placeholder="1.00"
              />
              <span className="block text-[11px] text-slate-400">
                {system
                  ? `Sistema: ${system.mandatoryDiscountRate.toFixed(2)} %`
                  : "Se aplica sobre total producido"}
              </span>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium text-slate-600">
                Otros descuentos
              </span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={otherDeductions}
                onChange={(event) => setOtherDeductions(event.target.value)}
                placeholder="0.00"
              />
              <span className="block text-[11px] text-slate-400">
                Opcional y manual
              </span>
            </label>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <p className="text-sm font-semibold text-slate-950">
              Deudas / descuentos
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {employeeId
                ? "Selecciona saldos reales y define cuánto descontar de cada uno."
                : "Sin personal seleccionado ingresa un monto total manual."}
            </p>
          </div>

          {!employeeId ? (
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-slate-600">
                Total de deudas a descontar
              </span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={manualDebtAmount}
                onChange={(event) => setManualDebtAmount(event.target.value)}
                placeholder="0.00"
              />
            </label>
          ) : isLoadingReference ? (
            <p className="text-sm text-slate-500">Cargando deudas…</p>
          ) : availableDebts.length === 0 ? (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800">
              El empleado no tiene deudas vigentes.
            </div>
          ) : (
            <div className="space-y-2">
              {availableDebts.map((debt) => {
                const checked = selectedDebts[debt.id] !== undefined;
                const outstanding = numeric(debt.outstanding_amount);
                return (
                  <article
                    key={debt.id}
                    className={`rounded-xl border p-3 transition ${
                      checked
                        ? "border-amber-200 bg-amber-50/50"
                        : "border-slate-200 bg-slate-50/50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        className="mt-1"
                        type="checkbox"
                        checked={checked}
                        onChange={(event) =>
                          setDebtSelected(debt, event.target.checked)
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900">
                            {debtTypeLabels[debt.debt_type] ?? debt.debt_type}
                          </p>
                          <strong className="text-sm tabular-nums text-rose-700">
                            {formatMoney(outstanding)}
                          </strong>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {debt.description || "Sin descripción"} ·{" "}
                          {relationName(debt.branch)}
                        </p>
                        {checked ? (
                          <label className="mt-3 block">
                            <span className="mb-1 block text-[11px] font-medium text-slate-500">
                              Monto a descontar
                            </span>
                            <Input
                              type="number"
                              min="0"
                              max={outstanding}
                              step="0.01"
                              value={selectedDebts[debt.id] ?? ""}
                              onChange={(event) =>
                                updateDebtAmount(debt, event.target.value)
                              }
                            />
                          </label>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <div className="mt-4 border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-500">
                {employeeId ? "Deuda seleccionada" : "Deuda manual"}
              </span>
              <strong className="tabular-nums text-slate-900">
                {formatMoney(result.debtRequested)}
              </strong>
            </div>
            {result.debtRequested > result.debtApplied ? (
              <p className="mt-2 text-xs leading-5 text-amber-700">
                La deuda seleccionada supera el importe disponible. En esta
                simulación solo se podrían aplicar{" "}
                <strong>{formatMoney(result.debtApplied)}</strong>.
              </p>
            ) : null}
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Comisión
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {formatMoney(result.commission)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Neto antes de deudas
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {formatMoney(result.beforeDebt)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Deuda aplicada
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-amber-300">
              -{formatMoney(result.debtApplied)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Neto estimado
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums text-emerald-300">
              {formatMoney(result.estimatedNet)}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
