"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type Customer = { id: string; full_name: string; document_number: string | null };
type Service = { id: string; name: string };
type Socio = { id: string; customer_id: string; branch_id: string | null; code: string | null; status: "active" | "inactive"; starts_at: string; ends_at: string | null; customer?: { full_name?: string } | null };
type Rule = { id: string; name: string; recognized_production_amount?: number | string; operational_contribution?: number | string };
type Assignment = { id: string; socio_id: string; status: "active" | "inactive"; starts_at: string; rule?: Rule | null };
type Data = { socios: Socio[]; assignments: Assignment[]; customers: Customer[]; rules: Rule[]; branches: Array<{ id: string; name: string }>; services: Service[] };

function todayInLima() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

const money = (value: number | string | undefined) => `S/ ${Number(value ?? 0).toFixed(2)}`;
const ruleBase = (rule: Rule | null | undefined) => Math.max(Number(rule?.recognized_production_amount ?? 0) - Number(rule?.operational_contribution ?? 0), 0);

export function SociosPanel({ mode = "full", onChanged }: { mode?: "full" | "rule" | "link"; onChanged?: () => void | Promise<void> }) {
  const [data, setData] = useState<Data | null>(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [form, setForm] = useState({ customerId: "", branchId: "", code: "", startsAt: todayInLima(), endsAt: "", notes: "" });
  const [assignment, setAssignment] = useState({ socioId: "", ruleId: "", startsAt: todayInLima(), endsAt: "" });
  const [socioRule, setSocioRule] = useState({ name: "", branchId: "", serviceId: "", benefitType: "free", benefitValue: "0", recognizedProductionAmount: "20", operationalContribution: "2", usageLimit: "1", periodKind: "calendar_month" });

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/socios", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo cargar Socios.");
      setData(payload.data);
    } finally { setIsLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load().catch((error) => setMessage(error instanceof Error ? error.message : "No se pudo cargar Socios.")); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const availableCustomers = useMemo(() => (data?.customers ?? []).filter((customer) => !(data?.socios ?? []).some((socio) => socio.customer_id === customer.id)), [data]);
  const suggestedCustomers = useMemo(() => {
    const term = customerSearch.trim().toLocaleLowerCase("es-PE");
    if (!term) return availableCustomers.slice(0, 30);
    return availableCustomers.filter((customer) => `${customer.full_name} ${customer.document_number ?? ""}`.toLocaleLowerCase("es-PE").includes(term)).slice(0, 30);
  }, [availableCustomers, customerSearch]);
  const recognized = Number(socioRule.recognizedProductionAmount || 0);
  const contribution = Number(socioRule.operationalContribution || 0);
  const commissionableBase = Math.max(recognized - contribution, 0);

  async function submit(action: "save" | "assignment" | "deactivate-assignment" | "socio-rule", body: Record<string, unknown>) {
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/admin/socios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...body }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo guardar.");
      const successMessage = action === "assignment" ? "Beneficio asignado al socio." : action === "deactivate-assignment" ? "Asignación desactivada." : action === "socio-rule" ? "Regla exclusiva de socio creada." : "Socio creado o actualizado.";
      setMessage(successMessage);
      await Swal.fire({ icon: "success", title: successMessage, timer: 1800, showConfirmButton: false, confirmButtonColor: "#0f766e" });
      if (action === "save") { setForm({ customerId: "", branchId: "", code: "", startsAt: todayInLima(), endsAt: "", notes: "" }); setCustomerSearch(""); }
      if (action === "assignment") setAssignment((current) => ({ ...current, ruleId: "" }));
      if (action === "socio-rule") setSocioRule({ name: "", branchId: "", serviceId: "", benefitType: "free", benefitValue: "0", recognizedProductionAmount: "20", operationalContribution: "2", usageLimit: "1", periodKind: "calendar_month" });
      await load();
      await onChanged?.();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "No se pudo guardar.";
      setMessage(errorMessage);
      await Swal.fire({ icon: "error", title: "No se pudo completar la acción", text: errorMessage, confirmButtonColor: "#0f766e" });
    } finally { setSaving(false); }
  }

  return <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
    <div><h3 className="font-semibold text-slate-900">Socios vinculados a clientes</h3><p className="mt-1 text-sm text-slate-600">Un socio conserva su ficha de cliente y recibe reglas exclusivas, sin convertirse en empleado.</p></div>
    {message ? <p role="status" className="rounded-lg bg-white px-3 py-2 text-sm text-slate-700">{message}</p> : null}
    {isLoading ? <div className="rounded-lg border border-slate-200 bg-white px-3 py-4 text-sm text-slate-600">Cargando socios, clientes y reglas disponibles…</div> : null}

    {mode !== "rule" ? <>
    <div className="grid gap-3 lg:grid-cols-3">
      <label className="space-y-1"><span className="text-xs font-semibold uppercase text-slate-600">Buscar cliente</span><Input value={customerSearch} placeholder="Nombre o DNI" onChange={(event) => { setCustomerSearch(event.target.value); setForm((current) => ({ ...current, customerId: "" })); }} /></label>
      <label className="space-y-1"><span className="text-xs font-semibold uppercase text-slate-600">Cliente sugerido</span><Select value={form.customerId} onChange={(event) => { const customer = availableCustomers.find((item) => item.id === event.target.value); setForm((current) => ({ ...current, customerId: event.target.value })); if (customer) setCustomerSearch(customer.full_name); }}><option value="">{customerSearch ? "Seleccionar resultado" : "Escribe para buscar"}</option>{suggestedCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customer.full_name}{customer.document_number ? ` · ${customer.document_number}` : ""}</option>)}</Select></label>
      <label className="space-y-1"><span className="text-xs font-semibold uppercase text-slate-600">Sede</span><Select value={form.branchId} onChange={(event) => setForm((current) => ({ ...current, branchId: event.target.value }))}><option value="">Todas las sedes</option>{(data?.branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</Select></label>
      <label className="space-y-1"><span className="text-xs font-semibold uppercase text-slate-600">Código interno</span><Input value={form.code} placeholder="Opcional" onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} /></label>
      <label className="space-y-1"><span className="text-xs font-semibold uppercase text-slate-600">Inicio</span><Input type="date" value={form.startsAt} onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))} /></label>
      <label className="space-y-1"><span className="text-xs font-semibold uppercase text-slate-600">Fin</span><Input type="date" value={form.endsAt} onChange={(event) => setForm((current) => ({ ...current, endsAt: event.target.value }))} /></label>
      <label className="space-y-1"><span className="text-xs font-semibold uppercase text-slate-600">Notas</span><Input value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></label>
    </div>
    <Button disabled={isLoading || saving || !form.customerId || !form.startsAt} onClick={() => void submit("save", form)}>{saving ? "Guardando…" : "Crear socio"}</Button>
    </> : null}

    {mode !== "link" ? <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
      <p className="font-semibold text-slate-900">Nueva regla exclusiva de socio</p><p className="mt-1 text-sm text-slate-600">Puede ser gratis o con precio único. En ambos casos se reconoce un valor por servicio, se resta el aporte y la diferencia entra a la comisión variable del barbero.</p>
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <label className="space-y-1"><span className="text-xs font-semibold uppercase text-slate-600">Nombre de regla</span><Input value={socioRule.name} placeholder="Ej.: Corte gratis socio" onChange={(event) => setSocioRule((current) => ({ ...current, name: event.target.value }))} /></label>
        <label className="space-y-1"><span className="text-xs font-semibold uppercase text-slate-600">Servicio que cubre</span><Select value={socioRule.serviceId} onChange={(event) => setSocioRule((current) => ({ ...current, serviceId: event.target.value }))}><option value="">Todos los servicios</option>{(data?.services ?? []).map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</Select></label>
        <label className="space-y-1"><span className="text-xs font-semibold uppercase text-slate-600">Sede</span><Select value={socioRule.branchId} onChange={(event) => setSocioRule((current) => ({ ...current, branchId: event.target.value }))}><option value="">Todas las sedes</option>{(data?.branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</Select></label>
        <label className="space-y-1"><span className="text-xs font-semibold uppercase text-slate-600">Cobro al socio</span><Select value={socioRule.benefitType} onChange={(event) => setSocioRule((current) => ({ ...current, benefitType: event.target.value, benefitValue: event.target.value === "free" ? "0" : current.benefitValue }))}><option value="free">Gratis (S/ 0)</option><option value="fixed_price">Precio único</option></Select></label>
        {socioRule.benefitType === "fixed_price" ? <label className="space-y-1"><span className="text-xs font-semibold uppercase text-slate-600">Precio único (S/)</span><Input type="number" min="0" step="0.01" value={socioRule.benefitValue} onChange={(event) => setSocioRule((current) => ({ ...current, benefitValue: event.target.value }))} /></label> : <div className="rounded-md border border-violet-200 bg-white px-3 py-2 text-xs text-slate-600">No se agregará pago en POS: el total será S/ 0.</div>}
        <label className="space-y-1"><span className="text-xs font-semibold uppercase text-slate-600">Valor reconocido por servicio (S/)</span><Input type="number" min="0.01" step="0.01" value={socioRule.recognizedProductionAmount} onChange={(event) => setSocioRule((current) => ({ ...current, recognizedProductionAmount: event.target.value }))} /></label>
        <label className="space-y-1"><span className="text-xs font-semibold uppercase text-slate-600">Aporte por servicio (S/)</span><Input type="number" min="0" step="0.01" value={socioRule.operationalContribution} onChange={(event) => setSocioRule((current) => ({ ...current, operationalContribution: event.target.value }))} /></label>
        <label className="space-y-1"><span className="text-xs font-semibold uppercase text-slate-600">Usos por período</span><Input type="number" min="1" step="1" value={socioRule.usageLimit} onChange={(event) => setSocioRule((current) => ({ ...current, usageLimit: event.target.value }))} /></label>
        <label className="space-y-1"><span className="text-xs font-semibold uppercase text-slate-600">Período</span><Select value={socioRule.periodKind} onChange={(event) => setSocioRule((current) => ({ ...current, periodKind: event.target.value }))}><option value="calendar_month">Mes calendario</option><option value="payroll_period">Período de planilla</option><option value="none">Sin límite de período</option></Select></label>
      </div>
      <div className="mt-3 rounded-lg border border-violet-200 bg-white p-3 text-sm text-slate-700"><span className="font-semibold">Base comisionable por servicio: {money(commissionableBase)}</span><span className="ml-2 text-slate-500">({money(recognized)} reconocido − {money(contribution)} aporte). Se aplicará el porcentaje vigente del barbero.</span></div>
      <Button className="mt-3" disabled={isLoading || saving || !socioRule.name || recognized <= 0 || contribution < 0 || contribution > recognized} onClick={() => void submit("socio-rule", socioRule)}>{saving ? "Guardando…" : "Crear regla de socio"}</Button>
    </div> : null}

    {mode !== "rule" ? <><div className="border-t border-slate-200 pt-4"><p className="text-sm font-semibold text-slate-900">Asignar regla a un socio</p><div className="mt-2 grid gap-3 lg:grid-cols-4"><Select value={assignment.socioId} onChange={(event) => setAssignment((current) => ({ ...current, socioId: event.target.value }))}><option value="">Seleccionar socio</option>{(data?.socios ?? []).filter((socio) => socio.status === "active").map((socio) => <option key={socio.id} value={socio.id}>{socio.customer?.full_name ?? "Socio"}</option>)}</Select><Select value={assignment.ruleId} onChange={(event) => setAssignment((current) => ({ ...current, ruleId: event.target.value }))}><option value="">Seleccionar regla de socio</option>{(data?.rules ?? []).map((rule) => <option key={rule.id} value={rule.id}>{rule.name} · base {money(ruleBase(rule))}</option>)}</Select><Input type="date" value={assignment.startsAt} onChange={(event) => setAssignment((current) => ({ ...current, startsAt: event.target.value }))} /><Input type="date" value={assignment.endsAt} onChange={(event) => setAssignment((current) => ({ ...current, endsAt: event.target.value }))} /></div><Button className="mt-3" disabled={isLoading || saving || !assignment.socioId || !assignment.ruleId} onClick={() => void submit("assignment", assignment)}>{saving ? "Guardando…" : "Asignar beneficio"}</Button></div>
    <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">{(data?.socios ?? []).map((socio) => <div key={socio.id} className="p-3 text-sm"><div><p className="font-medium text-slate-900">{socio.customer?.full_name ?? "Cliente"}</p><p className="text-xs text-slate-600">{socio.status === "active" ? "Activo" : "Inactivo"} · {socio.starts_at}{socio.ends_at ? ` hasta ${socio.ends_at}` : ""}</p></div>{(data?.assignments ?? []).filter((item) => item.socio_id === socio.id && item.status === "active").map((item) => <div key={item.id} className="mt-2 flex items-center justify-between rounded bg-slate-50 px-2 py-1 text-xs"><span>{item.rule?.name ?? "Regla"} · base {money(ruleBase(item.rule))} · desde {item.starts_at}</span><button type="button" className="font-semibold text-rose-700" onClick={() => void submit("deactivate-assignment", { id: item.id, endsAt: todayInLima() })}>Desactivar</button></div>)}</div>)}</div>
    </> : null}
  </section>;
}
