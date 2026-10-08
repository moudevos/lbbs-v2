"use client";

import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  compensationModeLabels,
  isCommissionCompensationMode,
  isFixedCompensationMode,
  resolveCompensationForPeriod,
  type EmployeeCompensationTerm,
} from "@/features/employees/compensation";

type Option = Record<string, unknown> & { id: string };
type Props = { onCancel: () => void; onCreated: (settlementId: string) => void };

export function SettlementDraftForm({ onCancel, onCreated }: Props) {
  const [periods, setPeriods] = useState<Option[]>([]);
  const [employees, setEmployees] = useState<Option[]>([]);
  const [compensationTerms, setCompensationTerms] = useState<EmployeeCompensationTerm[]>([]);
  const [currentPeriodIds, setCurrentPeriodIds] = useState<string[]>([]);
  const [periodId, setPeriodId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [rate, setRate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const response = await fetch("/api/admin/settlements", { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        if (!live) return;
        setPeriods(payload.periods ?? []);
        setEmployees(payload.employees ?? []);
        setCompensationTerms(payload.compensationTerms ?? []);
        setCurrentPeriodIds(payload.currentPeriodIds ?? []);
        setPeriodId((payload.currentPeriodIds ?? [])[0] ?? "");
      } catch (error) {
        if (live) {
          void Swal.fire({
            icon: "error",
            title: "No se pudo preparar el formulario",
            text: error instanceof Error ? error.message : "Error inesperado",
          });
        }
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, []);

  const selectedPeriod = useMemo(
    () => periods.find((period) => period.id === periodId) ?? null,
    [periodId, periods],
  );

  const selectedCompensation = useMemo(() => {
    if (!selectedPeriod || !employeeId) return null;
    return resolveCompensationForPeriod(
      compensationTerms,
      employeeId,
      String(selectedPeriod.start_date),
      String(selectedPeriod.end_date),
    );
  }, [compensationTerms, employeeId, selectedPeriod]);

  const requiresRate = isCommissionCompensationMode(selectedCompensation?.compensation_mode);
  const isFixed = isFixedCompensationMode(selectedCompensation?.compensation_mode);

  useEffect(() => {
    if (!requiresRate) setRate("");
  }, [requiresRate, selectedCompensation?.id]);

  async function createDraft() {
    if (!periodId || !employeeId || !selectedCompensation) return;
    if (requiresRate && rate === "") {
      await Swal.fire({
        icon: "warning",
        title: "Falta el porcentaje",
        text: "Este tipo de remuneración requiere indicar el porcentaje de comisión de la liquidación.",
      });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/admin/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodId,
          employeeId,
          commissionRate: requiresRate ? Number(rate) : null,
          debtDeductions: [],
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      onCreated(payload.data.id);
    } catch (error) {
      void Swal.fire({
        icon: "error",
        title: "No se pudo crear el borrador",
        text: error instanceof Error ? error.message : "Error inesperado",
      });
    } finally {
      setSaving(false);
    }
  }

  return <div className="space-y-4">
    <label className="block text-sm font-medium">Periodo
      <Select className="mt-1" value={periodId} disabled={loading} onChange={(event) => setPeriodId(event.target.value)}>
        <option value="">Seleccionar período</option>
        {periods.map((period) => <option key={period.id} value={period.id}>{currentPeriodIds.includes(period.id) ? "Vigente · " : ""}{String(period.start_date)} al {String(period.end_date)}</option>)}
      </Select>
    </label>

    <label className="block text-sm font-medium">Empleado
      <Select className="mt-1" value={employeeId} disabled={loading} onChange={(event) => setEmployeeId(event.target.value)}>
        <option value="">Seleccionar empleado</option>
        {employees.map((employee) => <option key={employee.id} value={employee.id}>{String(employee.full_name)}</option>)}
      </Select>
    </label>

    {periodId && employeeId ? (
      selectedCompensation ? (
        <section className="space-y-2 rounded-xl border border-sky-100 bg-sky-50 p-4 text-sm text-slate-700">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">Tipo de remuneración</span>
            <strong>{compensationModeLabels[selectedCompensation.compensation_mode]}</strong>
          </div>
          <p className="text-xs text-slate-600">
            Vigencia aplicable: {selectedCompensation.effective_from}
            {selectedCompensation.effective_to ? ` al ${selectedCompensation.effective_to}` : " en adelante"}.
          </p>

          {isFixed ? (
            <div className="rounded-lg bg-white px-3 py-2">
              {selectedCompensation.compensation_policy_version === 2 ? (
                <>
                  <span className="text-xs text-slate-500">Sueldo base mensual</span>
                  <p className="font-semibold">
                    S/ {Number(selectedCompensation.base_monthly_salary ?? 0).toFixed(2)}
                  </p>
                </>
              ) : (
                <>
                  <span className="text-xs text-slate-500">Monto fijo legado</span>
                  <p className="font-semibold">
                    S/ {Number(selectedCompensation.fixed_amount ?? 0).toFixed(2)}
                  </p>
                </>
              )}
            </div>
          ) : null}

          <p className="text-xs text-slate-600">
            Descuento obligatorio: {selectedCompensation.mandatory_discount_enabled
              ? `${Number(selectedCompensation.mandatory_discount_rate ?? 0).toFixed(2)} %`
              : "No aplica"}.
          </p>
        </section>
      ) : (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <strong>Remuneración pendiente de configurar.</strong>
          <p className="mt-1 text-xs">
            Este empleado no tiene una condición remunerativa aplicable al período seleccionado. Configúrala antes de crear la liquidación.
          </p>
        </section>
      )
    ) : null}

    {selectedCompensation && requiresRate ? (
      <label className="block text-sm font-medium">Porcentaje de comisión
        <Input
          className="mt-1"
          type="number"
          min="0"
          max="100"
          step="0.01"
          value={rate}
          onChange={(event) => setRate(event.target.value)}
          placeholder="Porcentaje de esta liquidación"
        />
      </label>
    ) : null}

    {selectedCompensation && isFixed ? (
      <p className="text-xs text-slate-500">
        El sueldo fijo se calcula con la lógica vigente del período. No se solicita porcentaje de comisión.
      </p>
    ) : null}

    <p className="text-xs text-slate-500">
      La producción se prepara desde la lógica canónica y solo considera ventas consolidadas. Las deudas se eligen dentro del borrador.
    </p>

    <div className="flex justify-end gap-2 pt-2">
      <Button className="bg-white text-slate-700 hover:bg-slate-50" disabled={saving} onClick={onCancel}>
        Cancelar
      </Button>
      <Button
        disabled={
          loading
          || saving
          || !periodId
          || !employeeId
          || !selectedCompensation
          || (requiresRate && rate === "")
        }
        onClick={() => void createDraft()}
      >
        {saving ? "Creando…" : "Crear borrador"}
      </Button>
    </div>
  </div>;
}
