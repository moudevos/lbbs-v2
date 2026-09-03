"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Swal from "sweetalert2";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/Modal";
import { normalizeSearchText } from "@/lib/utils/search";
import { SociosPanel } from "@/features/settings/SociosPanel";

type Option = { id: string; name?: string; full_name?: string; document_number?: string | null; role?: string };
type InternalLink = {
  id: string;
  can_use_internal_credit: boolean;
  is_active: boolean;
  employee?: { full_name?: string | null } | null;
  customer?: { full_name?: string | null; document_number?: string | null } | null;
};
type InternalRule = {
  id: string;
  name: string;
  benefit_type: string;
  benefit_value: number;
  usage_limit: number;
  is_active: boolean;
  production_mode?: "fixed" | "percentage" | "none";
  fixed_barber_payout?: number;
  applies_to?: "service" | "product" | "all"; service_id?: string | null; product_id?: string | null; period_kind?: "calendar_month" | "payroll_period" | "none"; operational_contribution?: number; recognized_production_amount?: number; is_internal_complimentary?: boolean;
};
type SocioLink = { id: string; status: "active" | "inactive"; starts_at: string; ends_at: string | null; customer?: { full_name?: string | null; document_number?: string | null } | null };
type SocioAssignment = { id: string; socio_id: string; status: "active" | "inactive"; starts_at: string; rule?: { name?: string | null } | null };
type Data = {
  employees: Option[]; customers: Option[]; links: InternalLink[];
  rules: InternalRule[]; socioRules: InternalRule[]; socios: SocioLink[]; socioAssignments: SocioAssignment[];
  branches: Option[]; services: Option[]; products: Option[];
};

const initialRule = { name: "", appliesTo: "all", catalogId: "", benefitType: "fixed_price", benefitValue: "0", periodKind: "calendar_month", usageLimit: "1", eligibleRole: "", branchId: "", productionMode: "fixed", fixedBarberPayout: "0", operationalContribution: "0", internalComplimentary: false };

function HelpHint({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  return <span className="relative inline-flex">
    <button type="button" aria-label="Ver ayuda" aria-expanded={isOpen} onClick={() => setIsOpen((current) => !current)} className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-400 text-[10px] font-bold text-slate-600 hover:bg-slate-100">?</button>
    {isOpen ? <span role="tooltip" className="absolute left-0 top-6 z-20 w-64 rounded-lg bg-slate-800 px-3 py-2 text-xs font-normal normal-case tracking-normal text-white shadow-lg">{children}</span> : null}
  </span>;
}

function Field({ label, help, children }: { label: string; help: string; children: ReactNode }) {
  return <label className="block space-y-1.5"><span className="flex items-center text-xs font-semibold uppercase tracking-wide text-slate-600">{label}<HelpHint>{help}</HelpHint></span>{children}</label>;
}

export function InternalBenefitsPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [authorizationPin, setAuthorizationPin] = useState("");
  const [link, setLink] = useState({ employeeId: "", customerId: "", canUseCredit: true });
  const [rule, setRule] = useState(initialRule);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<"rules" | "links" | "authorization">("rules");
  const [isEmployeeLinkModalOpen, setIsEmployeeLinkModalOpen] = useState(false);
  const [isSocioModalOpen, setIsSocioModalOpen] = useState(false);
  const [isEmployeeRuleModalOpen, setIsEmployeeRuleModalOpen] = useState(false);
  const [isSocioRuleModalOpen, setIsSocioRuleModalOpen] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/internal-pos-config", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo cargar la configuración interna.");
      setData(payload.data);
    } finally { setIsLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load().catch((error) => setMessage(error instanceof Error ? error.message : "No se pudo cargar la configuración interna.")); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const visibleCustomers = useMemo(() => {
    const term = normalizeSearchText(customerSearch);
    const customers = data?.customers ?? [];
    if (!term) return customers.slice(0, 80);
    return customers.filter((customer) => [customer.full_name, customer.document_number].filter(Boolean).some((value) => normalizeSearchText(value ?? "").includes(term))).slice(0, 80);
  }, [customerSearch, data?.customers]);
  const barbers = (data?.employees ?? []).filter((employee) => employee.role === "barber");
  const otherEmployees = (data?.employees ?? []).filter((employee) => employee.role !== "barber");
  const catalog = rule.appliesTo === "service" ? data?.services ?? [] : rule.appliesTo === "product" ? data?.products ?? [] : [];
  const activeLinks = (data?.links ?? []).filter((linkItem) => linkItem.is_active);
  const activeRules = (data?.rules ?? []).filter((ruleItem) => ruleItem.is_active);
  const activeSocioRules = (data?.socioRules ?? []).filter((ruleItem) => ruleItem.is_active);
  const activeSocios = (data?.socios ?? []).filter((socio) => socio.status === "active");

  async function save(action: "link" | "rule") {
    setMessage(""); setIsSaving(true);
    try {
      const body = action === "link" ? { action, ...link } : { action, id: editingRuleId, ...rule, benefitValue: Number(rule.benefitValue), usageLimit: Number(rule.usageLimit), fixedBarberPayout: Number(rule.fixedBarberPayout), operationalContribution: Number(rule.operationalContribution) };
      const response = await fetch("/api/admin/internal-pos-config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo guardar.");
      setMessage(action === "link" ? "Cliente vinculado al empleado." : "Regla de beneficio guardada.");
      await Swal.fire({ icon: "success", title: action === "link" ? "Vínculo guardado" : editingRuleId ? "Nueva versión de la regla creada" : "Regla guardada", timer: 1800, showConfirmButton: false, confirmButtonColor: "#0f766e" });
      if (action === "link") { setLink((current) => ({ ...current, customerId: "" })); setCustomerSearch(""); } else { setRule(initialRule); setEditingRuleId(null); }
      await load();
    } catch (error) { const errorMessage = error instanceof Error ? error.message : "No se pudo guardar."; setMessage(errorMessage); await Swal.fire({ icon: "error", title: "No se pudo guardar", text: errorMessage, confirmButtonColor: "#0f766e" }); }
    finally { setIsSaving(false); }
  }

  async function saveAuthorizationPin() {
    setMessage(""); setIsSaving(true);
    try {
      const response = await fetch("/api/admin/internal-pos-config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "authorization-pin", pin: authorizationPin }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo guardar el PIN.");
      setAuthorizationPin(""); setMessage("PIN de autorización actualizado.");
      await Swal.fire({ icon: "success", title: "PIN actualizado", timer: 1800, showConfirmButton: false, confirmButtonColor: "#0f766e" });
    } catch (error) { const errorMessage = error instanceof Error ? error.message : "No se pudo guardar el PIN."; setMessage(errorMessage); await Swal.fire({ icon: "error", title: "No se pudo actualizar el PIN", text: errorMessage, confirmButtonColor: "#0f766e" }); }
    finally { setIsSaving(false); }
  }

  async function deactivateRule(id: string) {
    if (!window.confirm("¿Desactivar esta regla? No se eliminará el historial.")) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/admin/internal-pos-config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "deactivate-rule", id }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo desactivar la regla.");
      setMessage("Regla desactivada. Ya no aparecerá en POS.");
      await Swal.fire({ icon: "success", title: "Regla desactivada", timer: 1800, showConfirmButton: false, confirmButtonColor: "#0f766e" });
      await load();
    } catch (error) { const errorMessage = error instanceof Error ? error.message : "No se pudo desactivar la regla."; setMessage(errorMessage); await Swal.fire({ icon: "error", title: "No se pudo desactivar", text: errorMessage, confirmButtonColor: "#0f766e" }); }
    finally { setIsSaving(false); }
  }

  function editRule(ruleItem: InternalRule) {
    setEditingRuleId(ruleItem.id);
    setRule({
      ...initialRule,
      name: ruleItem.name,
      appliesTo: ruleItem.applies_to === "service" && ruleItem.service_id ? "service" : ruleItem.applies_to === "product" && ruleItem.product_id ? "product" : ruleItem.applies_to === "service" ? "all_services" : ruleItem.applies_to === "product" ? "all_products" : "all",
      catalogId: ruleItem.service_id ?? ruleItem.product_id ?? "",
      benefitType: ruleItem.benefit_type,
      benefitValue: String(ruleItem.benefit_value),
      usageLimit: String(ruleItem.usage_limit),
      periodKind: ruleItem.period_kind ?? "calendar_month",
      productionMode: ruleItem.production_mode ?? "fixed",
      fixedBarberPayout: String(ruleItem.fixed_barber_payout ?? 0),
      operationalContribution: String(ruleItem.operational_contribution ?? 0),
      internalComplimentary: Boolean(ruleItem.is_internal_complimentary),
    });
    setActivePanel("rules");
    setIsEmployeeRuleModalOpen(true);
  }

  return <section className="space-y-5">
    <div><h2 className="text-base font-semibold text-slate-900">Beneficios internos</h2><p className="mt-1 text-sm text-slate-600">Reglas, vínculos con empleados o socios y autorización para operaciones internas de POS.</p></div>
    <nav className="flex flex-wrap gap-2" aria-label="Secciones de beneficios internos">{([['rules','Reglas'],['links','Vinculaciones'],['authorization','Contraseña de autorización']] as const).map(([key,label]) => <button key={key} type="button" onClick={() => setActivePanel(key)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${activePanel === key ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>{label}</button>)}</nav>
    {message ? <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700" role="status">{message}</p> : null}
    {isLoading ? <p className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-600" role="status">Cargando configuración de beneficios…</p> : null}
    {activePanel === "authorization" ? <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4"><div><h3 className="font-semibold text-amber-950">PIN de autorización del owner</h3><p className="mt-1 text-sm text-amber-900">Se solicita para confirmar consumos internos sin cobro. Usa entre 6 y 12 dígitos; el sistema guarda únicamente su hash.</p></div><div className="flex max-w-md gap-2"><Input type="password" inputMode="numeric" maxLength={12} placeholder="Nuevo PIN" value={authorizationPin} onChange={(event) => setAuthorizationPin(event.target.value.replace(/\D/g, ""))} /><Button disabled={isSaving || authorizationPin.length < 6} onClick={() => void saveAuthorizationPin()}>Guardar PIN</Button></div></section> : null}
    {activePanel === "links" ? <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
      <div className="flex flex-wrap gap-2"><Button onClick={() => setIsEmployeeLinkModalOpen(true)}>Vincular empleado</Button><Button className="bg-violet-700 hover:bg-violet-600" onClick={() => setIsSocioModalOpen(true)}>Vincular socio</Button></div>
      <Modal open={isEmployeeLinkModalOpen} title="Vincular cliente con empleado" description="El POS reconocerá esta ficha como empleado y aplicará las opciones autorizadas." onClose={() => setIsEmployeeLinkModalOpen(false)} size="lg"><div className="space-y-3"><div className="grid gap-3 lg:grid-cols-3"><Field label="Barbero o empleado" help="Persona vinculada a la ficha del cliente."><Select value={link.employeeId} onChange={(event) => setLink((current) => ({ ...current, employeeId: event.target.value }))}><option value="">Seleccionar empleado</option>{barbers.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}{otherEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name} · {employee.role}</option>)}</Select></Field><Field label="Buscar cliente" help="Busca por nombre o DNI."><Input value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder="Nombre o DNI" /></Field><Field label="Cliente registrado" help="Ficha que se vinculará."><Select value={link.customerId} onChange={(event) => setLink((current) => ({ ...current, customerId: event.target.value }))}><option value="">Seleccionar cliente</option>{visibleCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customer.full_name}</option>)}</Select></Field></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={link.canUseCredit} onChange={(event) => setLink((current) => ({ ...current, canUseCredit: event.target.checked }))} />Permitir crédito interno de productos</label><Button disabled={isSaving || !link.employeeId || !link.customerId} onClick={() => { void save("link"); setIsEmployeeLinkModalOpen(false); }}>Guardar vínculo</Button></div></Modal>
      <Modal open={isSocioModalOpen} title="Vincular socio" description="Crea el perfil de socio sobre una ficha de cliente y asigna reglas vigentes." onClose={() => setIsSocioModalOpen(false)} size="xl"><SociosPanel mode="link" onChanged={load} /></Modal>
      <div className="hidden">
      <div><h3 className="font-semibold text-slate-900">1. Vincular cliente con barbero / empleado</h3><p className="mt-1 text-sm text-slate-600">Busca al cliente por nombre o DNI y luego confirma el vínculo.</p></div>
      <div className="grid gap-3 lg:grid-cols-3">
        <Field label="Barbero o empleado" help="Elige la persona que recibirá el beneficio o a quien se le podrá registrar crédito. Los barberos aparecen primero."><Select aria-label="Barbero o empleado" value={link.employeeId} onChange={(event) => setLink((current) => ({ ...current, employeeId: event.target.value }))}><option value="">Seleccionar barbero / empleado</option>{barbers.length ? <optgroup label="Barberos activos">{barbers.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}</optgroup> : null}{otherEmployees.length ? <optgroup label="Otros empleados activos">{otherEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name} · {employee.role}</option>)}</optgroup> : null}</Select></Field>
        <Field label="Buscar cliente" help="Escribe al menos una parte del nombre o el DNI. Luego elige el resultado en el siguiente campo."><Input aria-label="Buscar cliente" placeholder="Buscar cliente por nombre o DNI" value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} /></Field>
        <Field label="Cliente registrado" help="Esta será la ficha que el POS debe seleccionar para reconocer al empleado y mostrar sus opciones internas."><Select aria-label="Cliente registrado" value={link.customerId} onChange={(event) => setLink((current) => ({ ...current, customerId: event.target.value }))}><option value="">Seleccionar cliente encontrado</option>{visibleCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customer.full_name}{customer.document_number ? ` · DNI ${customer.document_number}` : ""}</option>)}</Select></Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={link.canUseCredit} onChange={(event) => setLink((current) => ({ ...current, canUseCredit: event.target.checked }))} />Permitir compras de productos a crédito para este empleado<HelpHint>Solo aplica a productos. El POS crea una deuda interna y no registra dinero en la caja.</HelpHint></label>
      <Button type="button" disabled={isSaving || !link.employeeId || !link.customerId} onClick={() => void save("link")}>Vincular cliente</Button>
      <SociosPanel />
      </div>
    </section> : null}
    {activePanel === "rules" && isEmployeeRuleModalOpen ? <Modal open title={editingRuleId ? "Crear nueva versión de regla" : "Crear beneficio de empleado"} description={editingRuleId ? "La versión anterior permanece en el historial; esta aplicará desde la fecha operativa actual." : "Configura el beneficio que podrá usar un empleado vinculado."} onClose={() => { setIsEmployeeRuleModalOpen(false); setEditingRuleId(null); setRule(initialRule); }} size="xl"><section className="space-y-3">
      <div><h3 className="font-semibold text-slate-900">2. Regla de beneficio</h3><p className="mt-1 text-sm text-slate-600">El precio, el límite y la forma de liquidar al ejecutor se validan en PostgreSQL al cerrar la venta.</p></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Field label="Nombre de la regla" help="Nombre visible en POS; por ejemplo, “Corte personal mensual”."><Input placeholder="Ej.: Corte personal mensual" value={rule.name} onChange={(event) => setRule((current) => ({ ...current, name: event.target.value }))} /></Field>
        <Field label="Aplica sobre" help="Elige si aplica a todo, a todos los servicios, a todos los productos o a un ítem específico."><Select value={rule.appliesTo} onChange={(event) => setRule((current) => ({ ...current, appliesTo: event.target.value, catalogId: "" }))}><option value="all">Todos los ítems</option><option value="all_services">Todos los servicios</option><option value="all_products">Todos los productos</option><option value="service">Un servicio específico</option><option value="product">Un producto específico</option></Select></Field>
        {["all", "all_services", "all_products"].includes(rule.appliesTo) ? <div /> : <Field label={rule.appliesTo === "service" ? "Servicio" : "Producto"} help="Solo este ítem recibirá el beneficio."><Select value={rule.catalogId} onChange={(event) => setRule((current) => ({ ...current, catalogId: event.target.value }))}><option value="">Seleccionar {rule.appliesTo === "service" ? "servicio" : "producto"}</option>{catalog.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>}
        <Field label="Tipo de beneficio" help="Gratis deja el total en cero; precio fijo cobra el monto indicado; descuento porcentual reduce el precio."><Select value={rule.benefitType} onChange={(event) => setRule((current) => ({ ...current, benefitType: event.target.value }))}><option value="free">Gratis</option><option value="fixed_price">Precio fijo</option><option value="discount_percent">Descuento porcentual</option></Select></Field>
        <Field label="Valor" help="Para precio fijo usa soles. Para descuento porcentual usa un valor entre 0 y 100."><Input type="number" min="0" placeholder="0" value={rule.benefitValue} onChange={(event) => setRule((current) => ({ ...current, benefitValue: event.target.value }))} /></Field>
        <Field label="Periodo" help="Define cuándo se reinicia el límite de usos."><Select value={rule.periodKind} onChange={(event) => setRule((current) => ({ ...current, periodKind: event.target.value }))}><option value="calendar_month">Por mes calendario</option><option value="payroll_period">Por quincena / período</option><option value="none">Sin límite temporal</option></Select></Field>
        <Field label="Disponible para" help="El POS muestra esta regla solo cuando el cliente elegido está vinculado a un empleado de este rol."><Select value={rule.eligibleRole} onChange={(event) => setRule((current) => ({ ...current, eligibleRole: event.target.value }))}><option value="">Todos los empleados vinculados</option><option value="barber">Solo barberos</option><option value="reception">Solo recepción</option><option value="admin">Solo administradores</option><option value="owner">Solo owner</option></Select></Field>
        <Field label="Usos por período" help="Cantidad máxima de veces que cada empleado puede usar esta regla en el periodo elegido."><Input type="number" min="1" placeholder="1" value={rule.usageLimit} onChange={(event) => setRule((current) => ({ ...current, usageLimit: event.target.value }))} /></Field>
        <Field label="Liquidación del ejecutor" help="Pago fijo suma un importe definido. Por porcentaje usa la base de producción y el porcentaje asignado en la liquidación. Sin liquidación no genera pago al ejecutor."><Select value={rule.productionMode} onChange={(event) => setRule((current) => ({ ...current, productionMode: event.target.value }))}><option value="fixed">Pago fijo</option><option value="percentage">Por porcentaje en liquidación</option><option value="none">Sin pago al ejecutor</option></Select></Field>
        {rule.productionMode === "fixed" ? <Field label="Pago fijo al ejecutor (S/)" help="Monto que se acumula para el barbero que realizó el servicio, aunque el cliente vinculado reciba el beneficio."><Input type="number" min="0" placeholder="0" value={rule.fixedBarberPayout} onChange={(event) => setRule((current) => ({ ...current, fixedBarberPayout: event.target.value }))} /></Field> : <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">{rule.productionMode === "percentage" ? "La venta generará base de producción. En la liquidación se aplica el porcentaje configurado al barbero." : "Esta regla no generará pago ni base de producción para el ejecutor."}</div>}
        <Field label="Aporte operativo (S/)" help="Monto operativo que queda para la barbería en esta atención antes de la liquidación."><Input type="number" min="0" placeholder="0" value={rule.operationalContribution} onChange={(event) => setRule((current) => ({ ...current, operationalContribution: event.target.value }))} /></Field>
      </div>
      <label className="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" checked={rule.internalComplimentary} onChange={(event) => setRule((current) => ({ ...current, internalComplimentary: event.target.checked, benefitType: event.target.checked ? "free" : current.benefitType }))} />Consumo interno sin cobro. Solo owner puede confirmarlo en POS y deberá escribir un motivo.</label>
      <div className="flex gap-2"><Button type="button" disabled={isSaving || !rule.name || (["service", "product"].includes(rule.appliesTo) && !rule.catalogId)} onClick={() => void save("rule")}>{editingRuleId ? "Crear nueva versión" : "Guardar regla"}</Button>{editingRuleId ? <Button type="button" className="bg-slate-100 text-slate-700 hover:bg-slate-200" onClick={() => { setEditingRuleId(null); setRule(initialRule); }}>Cancelar edición</Button> : null}</div>
      {editingRuleId ? <p className="text-xs text-slate-600">Se conservará la regla anterior y esta nueva versión aplicará desde la fecha operativa actual.</p> : null}
    </section></Modal> : null}
    {activePanel === "links" ? <section className="grid gap-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3"><h3 className="font-semibold text-slate-900">Vínculos activos <span className="text-slate-500">({activeLinks.length})</span></h3><p className="mt-1 text-xs text-slate-600">Clientes que el POS reconoce como barbero o empleado.</p></div>
        {activeLinks.length ? <div className="max-h-72 divide-y divide-slate-100 overflow-auto">{activeLinks.map((linkItem) => <div key={linkItem.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm"><div className="min-w-0"><p className="truncate font-medium text-slate-900">{linkItem.employee?.full_name ?? "Empleado"}</p><p className="truncate text-xs text-slate-600">{linkItem.customer?.full_name ?? "Cliente"}{linkItem.customer?.document_number ? ` · DNI ${linkItem.customer.document_number}` : ""}</p></div><span className={linkItem.can_use_internal_credit ? "rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800" : "rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600"}>{linkItem.can_use_internal_credit ? "Crédito habilitado" : "Sin crédito"}</span></div>)}</div> : <p className="px-4 py-6 text-sm text-slate-500">Aún no hay vínculos activos.</p>}
      </div>
      <div className="rounded-xl border border-violet-200 bg-violet-50 shadow-sm">
        <div className="border-b border-violet-200 px-4 py-3"><h3 className="font-semibold text-slate-900">Socios activos <span className="text-slate-500">({activeSocios.length})</span></h3><p className="mt-1 text-xs text-slate-600">Clientes vinculados como socios y sus reglas vigentes.</p></div>
        {activeSocios.length ? <div className="max-h-72 divide-y divide-violet-100 overflow-auto">{activeSocios.map((socio) => <div key={socio.id} className="px-4 py-3 text-sm"><p className="font-medium text-slate-900">{socio.customer?.full_name ?? "Socio"}</p><p className="mt-1 text-xs text-slate-600">Desde {socio.starts_at}{socio.ends_at ? ` hasta ${socio.ends_at}` : ""}</p>{(data?.socioAssignments ?? []).filter((assignment) => assignment.socio_id === socio.id && assignment.status === "active").map((assignment) => <p key={assignment.id} className="mt-1 text-xs font-medium text-violet-800">{assignment.rule?.name ?? "Regla de socio"} · desde {assignment.starts_at}</p>)}</div>)}</div> : <p className="px-4 py-6 text-sm text-slate-500">Aún no hay socios activos.</p>}
      </div>
    </section> : null}
    {activePanel === "rules" ? <section className="grid gap-4">
      <div className="flex flex-wrap gap-2"><Button type="button" onClick={() => { setEditingRuleId(null); setRule(initialRule); setIsEmployeeRuleModalOpen(true); }}>Crear beneficio de empleado</Button><Button type="button" className="bg-violet-700 hover:bg-violet-600" onClick={() => setIsSocioRuleModalOpen(true)}>Crear regla de socio</Button></div>
      <Modal open={isSocioRuleModalOpen} title="Crear regla de socio" description="Define si la atención es gratis o con precio único y la base variable del barbero." onClose={() => setIsSocioRuleModalOpen(false)} size="xl"><SociosPanel mode="rule" onChanged={load} /></Modal>
      <div className="rounded-xl border border-slate-200 bg-slate-50 shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3"><h3 className="font-semibold text-slate-900">Reglas activas <span className="text-slate-500">({activeRules.length})</span></h3><p className="mt-1 text-xs text-slate-600">Beneficios disponibles para las operaciones internas del POS.</p></div>
        {activeRules.length ? <div className="max-h-72 divide-y divide-slate-100 overflow-auto">{activeRules.map((ruleItem) => <div key={ruleItem.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm"><div className="min-w-0"><p className="truncate font-medium text-slate-900">{ruleItem.name}</p><p className="truncate text-xs text-slate-600">{ruleItem.benefit_type === "free" ? "Gratis" : ruleItem.benefit_type === "fixed_price" ? `Precio fijo: S/ ${Number(ruleItem.benefit_value).toFixed(2)}` : `Descuento: ${ruleItem.benefit_value}%`} · {ruleItem.usage_limit} uso(s)</p></div><div className="flex shrink-0 items-center gap-2"><button type="button" onClick={() => editRule(ruleItem)} className="text-xs font-semibold text-sky-700 hover:text-sky-900">Editar</button><button type="button" disabled={isSaving} onClick={() => void deactivateRule(ruleItem.id)} className="text-xs font-semibold text-rose-700 hover:text-rose-900 disabled:opacity-50">Desactivar</button></div></div>)}</div> : <p className="px-4 py-6 text-sm text-slate-500">Aún no hay reglas activas.</p>}
      </div>
      <div className="rounded-xl border border-violet-200 bg-violet-50 shadow-sm">
        <div className="border-b border-violet-200 px-4 py-3"><h3 className="font-semibold text-slate-900">Reglas activas de socio <span className="text-slate-500">({activeSocioRules.length})</span></h3><p className="mt-1 text-xs text-slate-600">Reglas exclusivas que se asignan a perfiles de socio.</p></div>
        {activeSocioRules.length ? <div className="max-h-72 divide-y divide-violet-100 overflow-auto">{activeSocioRules.map((ruleItem) => <div key={ruleItem.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm"><div className="min-w-0"><p className="truncate font-medium text-slate-900">{ruleItem.name}</p><p className="truncate text-xs text-slate-600">{ruleItem.benefit_type === "free" ? "Gratis" : `Precio único: S/ ${Number(ruleItem.benefit_value).toFixed(2)}`} · base S/ {Math.max(Number(ruleItem.recognized_production_amount ?? 0) - Number(ruleItem.operational_contribution ?? 0), 0).toFixed(2)}</p></div><button type="button" disabled={isSaving} onClick={() => void deactivateRule(ruleItem.id)} className="text-xs font-semibold text-rose-700 hover:text-rose-900 disabled:opacity-50">Desactivar</button></div>)}</div> : <p className="px-4 py-6 text-sm text-slate-500">Aún no hay reglas de socio activas.</p>}
      </div>
    </section> : null}
  </section>;
}
