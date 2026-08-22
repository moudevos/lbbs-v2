"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Swal from "sweetalert2";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type Benefit = { productId: string; maxQuantity: string; maxUnitAmount: string };
type Rule = { id: string; name: string; branch_id: string | null; qualifying_service_id: string | null; minimum_unit_amount: number; maximum_courtesy_items: number; maximum_courtesy_amount: number | null; priority: number; is_active: boolean; benefits: Array<{ product_id: string; max_quantity: number; max_unit_amount: number | null }> };
type Product = { id: string; name: string; category_id: string | null; is_courtesy_allowed: boolean };
type Data = { rules: Rule[]; services: Array<{ id: string; name: string }>; products: Product[]; branches: Array<{ id: string; name: string }> };

const empty = () => ({ id: "", name: "", branchId: "", qualifyingServiceId: "", minimumUnitAmount: "0", maximumCourtesyItems: "1", maximumCourtesyAmount: "", priority: "0", benefits: [] as Benefit[] });

function Field({ label, help, children }: { label: string; help: string; children: ReactNode }) {
  return <label className="block space-y-1.5"><span className="block text-xs font-semibold uppercase tracking-wide text-slate-700">{label}</span>{children}<span className="block text-xs leading-4 text-slate-500">{help}</span></label>;
}

export function CourtesyRulesPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [form, setForm] = useState(empty());
  const [saving, setSaving] = useState(false);
  const [productSearch, setProductSearch] = useState("");

  const load = async () => {
    const response = await fetch("/api/admin/courtesy-rules", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error);
    setData(payload);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((error) => Swal.fire({ icon: "error", title: "No se pudieron cargar las reglas", text: error.message, confirmButtonColor: "#0f766e" }));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const visibleProducts = useMemo(() => {
    const query = productSearch.trim().toLocaleLowerCase("es-PE");
    if (!query) return data?.products ?? [];
    return (data?.products ?? []).filter((product) => product.name.toLocaleLowerCase("es-PE").includes(query));
  }, [data?.products, productSearch]);

  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const setBenefit = (productId: string, key: keyof Benefit, value: string) => setForm((current) => ({ ...current, benefits: current.benefits.map((benefit) => benefit.productId === productId ? { ...benefit, [key]: value } : benefit) }));
  const toggleProduct = (productId: string) => setForm((current) => {
    const selected = current.benefits.some((benefit) => benefit.productId === productId);
    return { ...current, benefits: selected ? current.benefits.filter((benefit) => benefit.productId !== productId) : [...current.benefits, { productId, maxQuantity: "1", maxUnitAmount: "" }] };
  });
  const edit = (rule: Rule) => setForm({ id: rule.id, name: rule.name, branchId: rule.branch_id ?? "", qualifyingServiceId: rule.qualifying_service_id ?? "", minimumUnitAmount: String(rule.minimum_unit_amount), maximumCourtesyItems: String(rule.maximum_courtesy_items), maximumCourtesyAmount: rule.maximum_courtesy_amount == null ? "" : String(rule.maximum_courtesy_amount), priority: String(rule.priority), benefits: rule.benefits.map((benefit) => ({ productId: benefit.product_id, maxQuantity: String(benefit.max_quantity), maxUnitAmount: benefit.max_unit_amount == null ? "" : String(benefit.max_unit_amount) })) });

  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/admin/courtesy-rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, benefits: form.benefits.map((benefit) => ({ productId: benefit.productId, maxQuantity: Number(benefit.maxQuantity), maxUnitAmount: benefit.maxUnitAmount })) }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setForm(empty());
      await load();
      await Swal.fire({ icon: "success", title: "Regla guardada", timer: 1200, showConfirmButton: false });
    } catch (error) {
      await Swal.fire({ icon: "error", title: "No se pudo guardar", text: error instanceof Error ? error.message : "Error inesperado", confirmButtonColor: "#0f766e" });
    } finally { setSaving(false); }
  };

  const toggle = async (rule: Rule) => {
    const response = await fetch("/api/admin/courtesy-rules", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: rule.id, isActive: !rule.is_active }) });
    if (response.ok) await load();
  };

  return <section className="space-y-4">
    <article className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><h2 className="font-semibold text-amber-950">Politicas de cortesia por servicio</h2><p className="mt-1 text-sm text-amber-900">La regla especifica de un servicio tiene prioridad sobre la general. El monto se evalua segun el precio final cobrado.</p></article>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">{form.id ? "Editar regla" : "Nueva regla"}</h2><p className="text-sm text-slate-500">Define que servicios habilitan la cortesia y los productos que puede entregar el POS.</p></div>{form.id ? <Button type="button" className="bg-slate-100 text-slate-700" onClick={() => setForm(empty())}>Cancelar edicion</Button> : null}</div>
      <div className="mt-5 grid gap-x-4 gap-y-5 md:grid-cols-3">
        <Field label="Nombre de la regla" help="Nombre visible al administrar. Ejemplo: Bebida por corte."><Input value={form.name} onChange={(event) => set("name", event.target.value)} placeholder="Ej.: Bebida por corte" /></Field>
        <Field label="Sede" help="Dejalo en todas las sedes si esta politica aplica a todo el negocio."><Select value={form.branchId} onChange={(event) => set("branchId", event.target.value)}><option value="">Todas las sedes</option>{data?.branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
        <Field label="Servicio que habilita" help="Sin seleccionar: aplica a todos los servicios. No aplica a productos vendidos sin servicio."><Select value={form.qualifyingServiceId} onChange={(event) => set("qualifyingServiceId", event.target.value)}><option value="">Todos los servicios</option>{data?.services.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
        <Field label="Monto minimo del servicio (S/)" help="La regla aplica si cada unidad del servicio cuesta este monto o mas."><Input type="number" min="0" step="0.01" value={form.minimumUnitAmount} onChange={(event) => set("minimumUnitAmount", event.target.value)} /></Field>
        <Field label="Cortesias por servicio" help="Cupo total por cada servicio pagado. Ej.: 2 servicios x 2 = 4 productos."><Input type="number" min="1" step="1" value={form.maximumCourtesyItems} onChange={(event) => set("maximumCourtesyItems", event.target.value)} /></Field>
        <Field label="Tope total por servicio (S/)" help="Opcional. Limita el valor total de cortesia por servicio; vacio no aplica tope monetario."><Input type="number" min="0" step="0.01" value={form.maximumCourtesyAmount} onChange={(event) => set("maximumCourtesyAmount", event.target.value)} placeholder="Sin tope" /></Field>
      </div>
      <div className="mt-6 border-t border-slate-100 pt-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-semibold">Productos elegibles</p><p className="text-xs text-slate-500">La tabla muestra solo productos marcados como admite cortesia en Catalogo. Si no seleccionas ninguno, se usan todos ellos.</p></div><div className="w-full sm:w-80"><label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Buscar producto</label><Input className="mt-1" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Nombre del producto" /></div></div>
        <div className="mt-3 max-h-[420px] overflow-auto rounded-xl border border-slate-200"><table className="min-w-full divide-y divide-slate-200"><thead className="sticky top-0 bg-slate-50"><tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><th className="w-16 px-4 py-3">Usar</th><th className="px-4 py-3">Producto</th><th className="w-36 px-4 py-3">Catalogo</th><th className="w-44 px-4 py-3">Maximo por servicio</th><th className="w-48 px-4 py-3">Tope unitario (S/)</th></tr></thead><tbody className="divide-y divide-slate-100 bg-white">{visibleProducts.map((product) => { const benefit = form.benefits.find((item) => item.productId === product.id); return <tr key={product.id} className={benefit ? "bg-emerald-50/50" : ""}><td className="px-4 py-3"><input aria-label={`Usar ${product.name} como cortesia`} type="checkbox" checked={Boolean(benefit)} onChange={() => toggleProduct(product.id)} className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" /></td><td className="px-4 py-3 text-sm font-medium text-slate-800">{product.name}</td><td className="px-4 py-3 text-xs">{product.is_courtesy_allowed ? <span className="rounded-full bg-emerald-100 px-2 py-1 font-medium text-emerald-800">Admite cortesia</span> : <span className="text-slate-400">No marcado</span>}</td><td className="px-4 py-3"><Input disabled={!benefit} type="number" min="1" step="1" value={benefit?.maxQuantity ?? ""} onChange={(event) => setBenefit(product.id, "maxQuantity", event.target.value)} placeholder="1" /></td><td className="px-4 py-3"><Input disabled={!benefit} type="number" min="0" step="0.01" value={benefit?.maxUnitAmount ?? ""} onChange={(event) => setBenefit(product.id, "maxUnitAmount", event.target.value)} placeholder="Sin tope" /></td></tr>; })}{visibleProducts.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">No hay productos que coincidan con la busqueda.</td></tr> : null}</tbody></table></div>
        <p className="mt-2 text-xs text-slate-500">Seleccionar productos crea una lista exclusiva para esta regla. Sin seleccionados, la regla usa automaticamente los productos permitidos desde Catalogo. Maximo por servicio limita cada producto seleccionado.</p>
      </div>
      <div className="mt-5"><Button type="button" disabled={saving} onClick={() => void save()}>{saving ? "Guardando..." : "Guardar regla"}</Button></div>
    </section>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b p-4"><h2 className="font-semibold">Reglas vigentes</h2></div>{data?.rules.map((rule) => <article key={rule.id} className="flex flex-wrap items-center justify-between gap-3 border-b p-4 last:border-0"><div><p className="font-medium">{rule.name} {!rule.is_active ? <span className="text-xs text-slate-500">(inactiva)</span> : null}</p><p className="text-sm text-slate-600">{rule.qualifying_service_id ? "Servicio especifico" : "Todos los servicios"} · desde S/ {Number(rule.minimum_unit_amount).toFixed(2)} · {rule.maximum_courtesy_items} cortesia(s) por servicio</p></div><div className="flex gap-2"><Button type="button" className="h-8 px-3 text-xs" onClick={() => edit(rule)}>Editar</Button><Button type="button" className="h-8 bg-slate-100 px-3 text-xs text-slate-700" onClick={() => void toggle(rule)}>{rule.is_active ? "Desactivar" : "Activar"}</Button></div></article>)}</section>
  </section>;
}
