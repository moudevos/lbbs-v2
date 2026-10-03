"use client";

import { useEffect, useState } from "react";
import Swal from "sweetalert2";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type Option = Record<string, unknown> & { id: string };
type Props = { onCancel: () => void; onCreated: (settlementId: string) => void };

export function SettlementDraftForm({ onCancel, onCreated }: Props) {
  const [periods, setPeriods] = useState<Option[]>([]);
  const [employees, setEmployees] = useState<Option[]>([]);
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
        setCurrentPeriodIds(payload.currentPeriodIds ?? []);
        setPeriodId((payload.currentPeriodIds ?? [])[0] ?? "");
      } catch (error) {
        if (live) void Swal.fire({ icon: "error", title: "No se pudo preparar el formulario", text: error instanceof Error ? error.message : "Error inesperado" });
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, []);

  async function createDraft() {
    if (!periodId || !employeeId) return;
    setSaving(true);
    try {
      const response = await fetch("/api/admin/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodId, employeeId, commissionRate: rate === "" ? null : Number(rate), debtDeductions: [] }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      onCreated(payload.data.id);
    } catch (error) {
      void Swal.fire({ icon: "error", title: "No se pudo crear el borrador", text: error instanceof Error ? error.message : "Error inesperado" });
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
    <label className="block text-sm font-medium">Porcentaje de comisión
      <Input className="mt-1" type="number" min="0" max="100" step="0.01" value={rate} onChange={(event) => setRate(event.target.value)} placeholder="Según contrato" />
    </label>
    <p className="text-xs text-slate-500">La producción se prepara desde la lógica canónica. Las deudas se eligen dentro del borrador.</p>
    <div className="flex justify-end gap-2 pt-2">
      <Button className="bg-white text-slate-700 hover:bg-slate-50" disabled={saving} onClick={onCancel}>Cancelar</Button>
      <Button disabled={loading || saving || !periodId || !employeeId} onClick={() => void createDraft()}>{saving ? "Creando…" : "Crear borrador"}</Button>
    </div>
  </div>;
}
