"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/features/pos/pos-utils";

type Product = { id: string; name: string; sku: string | null; cost_price: number };
type CatalogItem = { id: string; product_id: string; employee_unit_price: number; is_active: boolean; updated_at: string; product: Product | Product[] | null };
type Person = { id: string; full_name: string; branch_id: string };
type Branch = { id: string; name: string };
type PaymentMethod = { id: string; name: string; payment_kind: string };
type Batch = { id: string; total_charge_amount: number; payment_mode: string; created_at: string; employee: { full_name?: string } | Array<{ full_name?: string }> | null };
type Payload = { role: string; catalog: CatalogItem[]; employees: Person[]; branches: Branch[]; paymentMethods: PaymentMethod[]; products: Product[]; batches: Batch[] };
type Line = { catalogItemId: string; quantity: string };

const productOf = (item: CatalogItem) => Array.isArray(item.product) ? item.product[0] ?? null : item.product;
const employeeOf = (batch: Batch) => Array.isArray(batch.employee) ? batch.employee[0]?.full_name : batch.employee?.full_name;

export function EmployeeSuppliesPageClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [paymentMode, setPaymentMode] = useState<"credit" | "immediate">("credit");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [catalogProductId, setCatalogProductId] = useState("");
  const [catalogPrice, setCatalogPrice] = useState("");
  const [editingPrices, setEditingPrices] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/employee-supplies", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudo cargar el catálogo.");
      setData(body);
      setBranchId((current) => current || body.branches[0]?.id || "");
    } catch (error) {
      await Swal.fire({ icon: "error", title: "No se pudo cargar insumos", text: error instanceof Error ? error.message : "Error inesperado", confirmButtonColor: "#0f766e" });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const activeCatalog = useMemo(() => (data?.catalog ?? []).filter((item) => item.is_active), [data]);
  const cart = useMemo(() => lines.map((line) => ({ ...line, item: activeCatalog.find((item) => item.id === line.catalogItemId) ?? null })).filter((line) => line.item), [activeCatalog, lines]);
  const total = cart.reduce((sum, line) => sum + Number(line.item!.employee_unit_price) * Number(line.quantity || 0), 0);
  const selectedEmployee = data?.employees.find((employee) => employee.id === employeeId);

  function addLine() {
    const available = activeCatalog.find((item) => !lines.some((line) => line.catalogItemId === item.id));
    if (!available) return;
    setLines((current) => [...current, { catalogItemId: available.id, quantity: "1" }]);
  }
  function updateLine(index: number, field: keyof Line, value: string) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, [field]: value } : line));
  }
  async function request(body: unknown) {
    const response = await fetch("/api/admin/employee-supplies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "No se pudo guardar.");
  }
  async function createCatalogItem() {
    try {
      setSaving(true);
      await request({ action: "catalog-create", productId: catalogProductId, employeeUnitPrice: catalogPrice });
      setCatalogProductId(""); setCatalogPrice("");
      await load();
      await Swal.fire({ icon: "success", title: "Producto habilitado", timer: 1200, showConfirmButton: false });
    } catch (error) {
      await Swal.fire({ icon: "error", title: "No se pudo guardar", text: error instanceof Error ? error.message : "Error inesperado", confirmButtonColor: "#0f766e" });
    } finally { setSaving(false); }
  }
  async function updateCatalog(item: CatalogItem, isActive = item.is_active) {
    try {
      setSaving(true);
      await request({ action: "catalog-update", id: item.id, employeeUnitPrice: editingPrices[item.id] ?? String(item.employee_unit_price), isActive });
      await load();
    } catch (error) {
      await Swal.fire({ icon: "error", title: "No se pudo actualizar", text: error instanceof Error ? error.message : "Error inesperado", confirmButtonColor: "#0f766e" });
    } finally { setSaving(false); }
  }
  async function submitIssue() {
    if (!employeeId || !branchId || cart.length === 0) {
      await Swal.fire({ icon: "warning", title: "Completa la entrega", text: "Selecciona empleado, sede y al menos un producto.", confirmButtonColor: "#0f766e" });
      return;
    }
    try {
      setSaving(true);
      await request({ employeeId, branchId, items: cart.map((line) => ({ catalogItemId: line.catalogItemId, quantity: Number(line.quantity) })), paymentMode, paymentMethodId, reference, notes });
      setLines([]); setReference(""); setNotes(""); setPaymentMethodId("");
      await load();
      await Swal.fire({ icon: "success", title: paymentMode === "credit" ? "Deuda registrada" : "Entrega registrada", text: paymentMode === "credit" ? "Se creó una sola deuda con el total de los insumos." : undefined, timer: 1600, showConfirmButton: false });
    } catch (error) {
      await Swal.fire({ icon: "error", title: "No se pudo registrar la entrega", text: error instanceof Error ? error.message : "Error inesperado", confirmButtonColor: "#0f766e" });
    } finally { setSaving(false); }
  }

  const isAdmin = data?.role === "owner" || data?.role === "admin";
  const unusedProducts = (data?.products ?? []).filter((product) => !(data?.catalog ?? []).some((item) => item.product_id === product.id));

  return <section className="space-y-5">
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Personal</p>
      <h1 className="mt-1 text-2xl font-bold text-slate-950">Insumos del personal</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">Configura el precio interno de guantes, talco, navajas u otros productos y registra una entrega con varios artículos. El sistema descuenta inventario y, si es a crédito, crea una sola deuda auditada.</p>
    </div>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2"><div><h2 className="font-semibold text-slate-900">Registrar entrega</h2><p className="text-sm text-slate-500">Los precios se toman del catálogo interno y quedan guardados en cada línea.</p></div><strong className="text-lg text-emerald-700">Total: {formatMoney(total)}</strong></div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-sm font-medium">Empleado<Select value={employeeId} onChange={(event) => { const id = event.target.value; setEmployeeId(id); const employee = data?.employees.find((item) => item.id === id); if (employee) setBranchId(employee.branch_id); }}><option value="">Seleccionar empleado</option>{data?.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}</Select></label>
        <label className="text-sm font-medium">Sede<Select value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">Seleccionar sede</option>{data?.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</Select></label>
        <label className="text-sm font-medium">Forma de cobro<Select value={paymentMode} onChange={(event) => setPaymentMode(event.target.value as "credit" | "immediate")}><option value="credit">Descontar como deuda</option><option value="immediate">Pago inmediato</option></Select></label>
      </div>
      {paymentMode === "immediate" ? <div className="mt-3 grid gap-3 md:grid-cols-2"><label className="text-sm font-medium">Método de pago<Select value={paymentMethodId} onChange={(event) => setPaymentMethodId(event.target.value)}><option value="">Seleccionar método</option>{data?.paymentMethods.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}</Select></label><Input placeholder="Referencia de pago (opcional)" value={reference} onChange={(event) => setReference(event.target.value)} /></div> : <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Se creará una única deuda por {formatMoney(total)} a nombre de {selectedEmployee?.full_name || "el empleado seleccionado"}.</p>}
      <div className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
        {cart.length === 0 ? <p className="py-2 text-sm text-slate-500">Aún no hay insumos agregados.</p> : cart.map((line, index) => <div key={`${line.catalogItemId}-${index}`} className="grid items-end gap-2 md:grid-cols-[1fr_130px_130px_auto]"><label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Producto<Select value={line.catalogItemId} onChange={(event) => updateLine(index, "catalogItemId", event.target.value)}>{activeCatalog.map((item) => <option key={item.id} value={item.id}>{productOf(item)?.name ?? "Producto"}</option>)}</Select></label><label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cantidad<Input type="number" min="0.01" step="0.01" value={line.quantity} onChange={(event) => updateLine(index, "quantity", event.target.value)} /></label><p className="h-11 rounded-md border border-slate-200 bg-white px-3 py-3 text-right text-sm font-semibold">{formatMoney(Number(line.item!.employee_unit_price) * Number(line.quantity || 0))}</p><Button className="h-11 bg-rose-100 text-rose-700 hover:bg-rose-200" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}>Quitar</Button></div>)}
        <Button className="bg-white text-slate-700 hover:bg-slate-100" onClick={addLine} disabled={activeCatalog.length === lines.length}>+ Agregar producto</Button>
      </div>
      <Textarea className="mt-3" placeholder="Observación de la entrega (opcional)" value={notes} onChange={(event) => setNotes(event.target.value)} />
      <div className="mt-3 flex justify-end"><Button disabled={saving || cart.length === 0} onClick={() => void submitIssue()}>{saving ? "Guardando..." : paymentMode === "credit" ? "Registrar deuda por insumos" : "Registrar entrega"}</Button></div>
    </section>

    {isAdmin ? <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4"><h2 className="font-semibold text-slate-900">Catálogo y precio interno</h2><p className="text-sm text-slate-500">Solo owner y admin pueden habilitar productos y definir lo que paga el empleado.</p></div><div className="grid gap-3 rounded-xl bg-slate-50 p-3 md:grid-cols-[1fr_180px_auto]"><Select value={catalogProductId} onChange={(event) => setCatalogProductId(event.target.value)}><option value="">Seleccionar producto de inventario</option>{unusedProducts.map((product) => <option key={product.id} value={product.id}>{product.name}{product.sku ? ` · ${product.sku}` : ""}</option>)}</Select><Input type="number" min="0.01" step="0.01" placeholder="Precio al empleado" value={catalogPrice} onChange={(event) => setCatalogPrice(event.target.value)} /><Button disabled={saving || !catalogProductId || Number(catalogPrice) <= 0} onClick={() => void createCatalogItem()}>Habilitar producto</Button></div><div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Producto</th><th className="px-3 py-2">Precio interno</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2" /></tr></thead><tbody className="divide-y divide-slate-100">{(data?.catalog ?? []).map((item) => <tr key={item.id}><td className="px-3 py-3"><strong>{productOf(item)?.name ?? "Producto eliminado"}</strong><p className="text-xs text-slate-500">Costo inventario: {formatMoney(Number(productOf(item)?.cost_price ?? 0))}</p></td><td className="px-3 py-3"><Input className="h-9 min-w-36" type="number" min="0.01" step="0.01" value={editingPrices[item.id] ?? String(item.employee_unit_price)} onChange={(event) => setEditingPrices((current) => ({ ...current, [item.id]: event.target.value }))} /></td><td className="px-3 py-3"><span className={item.is_active ? "rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-800" : "rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600"}>{item.is_active ? "Activo" : "Inactivo"}</span></td><td className="px-3 py-3"><div className="flex gap-2"><Button className="h-9 px-3 text-xs" disabled={saving} onClick={() => void updateCatalog(item)}>Guardar</Button><Button className="h-9 bg-slate-100 px-3 text-xs text-slate-700 hover:bg-slate-200" disabled={saving} onClick={() => void updateCatalog(item, !item.is_active)}>{item.is_active ? "Desactivar" : "Activar"}</Button></div></td></tr>)}</tbody></table></div></section> : null}

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-slate-900">Últimas entregas</h2><div className="mt-3 grid gap-2 md:grid-cols-3">{loading ? <p className="text-sm text-slate-500">Cargando...</p> : (data?.batches ?? []).length === 0 ? <p className="text-sm text-slate-500">No hay entregas registradas.</p> : data?.batches.map((batch) => <article key={batch.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="font-medium">{employeeOf(batch) ?? "Empleado"}</p><p className="text-sm text-slate-600">{batch.payment_mode === "credit" ? "Deuda por insumos" : "Pago inmediato"}</p><strong className="mt-1 block text-emerald-700">{formatMoney(Number(batch.total_charge_amount))}</strong><p className="mt-1 text-xs text-slate-500">{new Date(batch.created_at).toLocaleString("es-PE")}</p></article>)}</div></section>
  </section>;
}
