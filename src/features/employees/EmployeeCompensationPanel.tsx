"use client";

import { useEffect, useState } from "react";
import Swal from "sweetalert2";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/features/pos/pos-utils";

type Term = { id: string; compensation_mode: string; base_monthly_salary: number | string | null; mandatory_discount_enabled: boolean | null; mandatory_discount_rate: number | string | null; effective_from: string; effective_to: string | null };
type Props = { employeeId: string };

const modeLabel: Record<string, string> = { commission: "Comisión (legado)", commission_plus_bonus: "Comisión + bonos", commission_only: "Solo comisiones", fixed_plus_bonus: "Fijo + bonos", fixed: "Solo fijo" };

export function EmployeeCompensationPanel({ employeeId }: Props) {
  const [terms, setTerms] = useState<Term[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState("commission_plus_bonus");
  const [baseMonthlySalary, setBaseMonthlySalary] = useState("");
  const [mandatoryDiscountEnabled, setMandatoryDiscountEnabled] = useState(true);
  const [mandatoryDiscountRate, setMandatoryDiscountRate] = useState("1.00");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [notes, setNotes] = useState("");

  async function load() {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/employees/${employeeId}/compensation`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setTerms(payload.data ?? []);
    } catch (error) {
      await Swal.fire({ icon: "error", title: "No se pudo cargar compensación", text: error instanceof Error ? error.message : "Error inesperado", confirmButtonColor: "#0f766e" });
    } finally { setLoading(false); }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [employeeId]);

  const needsSalary = mode === "fixed" || mode === "fixed_plus_bonus";
  async function save() {
    if (!effectiveFrom || (needsSalary && Number(baseMonthlySalary) <= 0) || (mandatoryDiscountEnabled && (Number(mandatoryDiscountRate) < 0 || Number(mandatoryDiscountRate) > 100))) return;
    const replaceCurrent = terms.some((term) => term.effective_from < effectiveFrom && (!term.effective_to || term.effective_to >= effectiveFrom));
    if (replaceCurrent) {
      const confirmation = await Swal.fire({ icon: "warning", title: "Cambiar condición vigente", text: "La condición anterior se cerrará el día anterior y se conservará en el historial.", showCancelButton: true, confirmButtonText: "Crear nueva condición", cancelButtonText: "Cancelar", confirmButtonColor: "#0f766e" });
      if (!confirmation.isConfirmed) return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/employees/${employeeId}/compensation`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ compensationMode: mode, baseMonthlySalary: needsSalary ? Number(baseMonthlySalary) : null, mandatoryDiscountEnabled, mandatoryDiscountRate: mandatoryDiscountEnabled ? Number(mandatoryDiscountRate) : 0, effectiveFrom, notes, replaceCurrent }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setBaseMonthlySalary(""); setEffectiveFrom(""); setNotes(""); await load();
      await Swal.fire({ icon: "success", title: "Condición registrada", timer: 1200, showConfirmButton: false });
    } catch (error) {
      await Swal.fire({ icon: "error", title: "No se pudo guardar", text: error instanceof Error ? error.message : "Error inesperado", confirmButtonColor: "#0f766e" });
    } finally { setSaving(false); }
  }

  return <section className="space-y-4">
    <div className="rounded-xl border border-sky-100 bg-sky-50 p-3 text-sm text-sky-900">La condición se toma por fecha. Un cambio conserva el historial y no reescribe liquidaciones ni cierres existentes.</div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-1 text-sm">Tipo de remuneración<Select value={mode} onChange={(event) => setMode(event.target.value)}><option value="commission_plus_bonus">Comisión + bonos</option><option value="commission_only">Solo comisiones</option><option value="fixed_plus_bonus">Fijo + bonos</option><option value="fixed">Solo fijo</option></Select></label>
      <label className="space-y-1 text-sm">Vigente desde<Input type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} /></label>
      {["commission_plus_bonus", "commission_only"].includes(mode) ? <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">El porcentaje de comisión se asignará durante la liquidación según el rendimiento del período.</p> : <label className="space-y-1 text-sm">Sueldo base mensual<Input type="number" min="0.01" step="0.01" value={baseMonthlySalary} onChange={(event) => setBaseMonthlySalary(event.target.value)} required /></label>}
      <label className="space-y-1 text-sm">Notas<Textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
    </div>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mandatoryDiscountEnabled} onChange={(event) => setMandatoryDiscountEnabled(event.target.checked)} />Aplicar descuento obligatorio</label>
    {mandatoryDiscountEnabled ? <label className="block max-w-xs space-y-1 text-sm">Porcentaje descuento obligatorio<Input type="number" min="0" max="100" step="0.01" value={mandatoryDiscountRate} onChange={(event) => setMandatoryDiscountRate(event.target.value)} /></label> : null}
    <Button type="button" disabled={saving} onClick={() => void save()}>{saving ? "Guardando..." : "Crear condición"}</Button>
    <div className="space-y-2"><p className="text-sm font-semibold">Historial</p>{loading ? <p className="text-sm text-slate-500">Cargando...</p> : terms.length ? terms.map((term) => <div key={term.id} className="grid gap-1 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm sm:grid-cols-[1fr_auto]"><span><strong>{modeLabel[term.compensation_mode] ?? term.compensation_mode}</strong><br /><span className="text-slate-600">{term.effective_from} {term.effective_to ? `a ${term.effective_to}` : "en adelante"}</span></span><strong>{["commission_plus_bonus", "commission_only"].includes(term.compensation_mode) ? "Comisión al liquidar" : `${formatMoney(Number(term.base_monthly_salary ?? 0))} mensual`}<br /><span className="text-xs font-normal text-slate-500">Descuento obligatorio: {term.mandatory_discount_enabled ? `${Number(term.mandatory_discount_rate ?? 0).toFixed(2)} %` : "No aplica"}</span></strong></div>) : <p className="text-sm text-amber-700">Compensación pendiente de configurar.</p>}</div>
  </section>;
}
