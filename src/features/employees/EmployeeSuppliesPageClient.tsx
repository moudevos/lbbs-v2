"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/features/pos/pos-utils";

type Product = { id: string; name: string };
type CatalogItem = { id: string; employee_unit_price: number | string; is_active: boolean; product: Product | Product[] | null };
type Employee = { id: string; full_name: string; branch_id: string };
type Branch = { id: string; name: string };
type PaymentMethod = { id: string; name: string };
type Batch = { id: string; total_charge_amount: number | string; payment_mode: string; status: "active" | "waived" | "cancelled"; status_reason: string | null; created_at: string; employee: { full_name?: string } | Array<{ full_name?: string }> | null };
type Data = { catalog: CatalogItem[]; employees: Employee[]; branches: Branch[]; paymentMethods: PaymentMethod[]; batches: Batch[] };
type Line = { catalogItemId: string; quantity: string };

const productName = (item: CatalogItem) => (Array.isArray(item.product) ? item.product[0] : item.product)?.name ?? "Producto";
const batchEmployeeName = (batch: Batch) => (Array.isArray(batch.employee) ? batch.employee[0] : batch.employee)?.full_name ?? "Empleado";
const batchStatus = (batch: Batch) => ({
  active: { label: "Entrega vigente", className: "bg-emerald-100 text-emerald-800" },
  waived: { label: "Sin efecto", className: "bg-slate-200 text-slate-700" },
  cancelled: { label: "Entrega anulada", className: "bg-rose-100 text-rose-800" },
}[batch.status] ?? { label: batch.status, className: "bg-slate-100 text-slate-700" });

export function EmployeeSuppliesPageClient() {
  const [data, setData] = useState<Data | null>(null);
  const [saving, setSaving] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [paymentMode, setPaymentMode] = useState<"credit" | "immediate">("credit");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/employee-supplies", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudo cargar las entregas.");
      setData(body);
      setBranchId((current) => current || body.branches[0]?.id || "");
    } catch (error) {
      await Swal.fire({ icon: "error", title: "No se pudo cargar insumos", text: error instanceof Error ? error.message : "Error inesperado", confirmButtonColor: "#0f766e" });
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const activeCatalog = useMemo(() => (data?.catalog ?? []).filter((item) => item.is_active), [data]);
  const cart = useMemo(() => lines.map((line) => ({ ...line, item: activeCatalog.find((item) => item.id === line.catalogItemId) ?? null })).filter((line) => line.item), [activeCatalog, lines]);
  const total = cart.reduce((sum, line) => sum + Number(line.item?.employee_unit_price ?? 0) * Number(line.quantity || 0), 0);

  function addLine() {
    const next = activeCatalog.find((item) => !lines.some((line) => line.catalogItemId === item.id));
    if (next) setLines((current) => [...current, { catalogItemId: next.id, quantity: "1" }]);
  }
  function updateLine(index: number, key: keyof Line, value: string) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, [key]: value } : line));
  }
  async function submit() {
    if (!employeeId || !branchId || cart.length === 0) {
      await Swal.fire({ icon: "warning", title: "Completa la entrega", text: "Selecciona empleado, sede y al menos un producto.", confirmButtonColor: "#0f766e" });
      return;
    }
    try {
      setSaving(true);
      const response = await fetch("/api/admin/employee-supplies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeId, branchId, paymentMode, paymentMethodId, reference, notes, items: cart.map((line) => ({ catalogItemId: line.catalogItemId, quantity: Number(line.quantity) })) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudo registrar la entrega.");
      setLines([]); setReference(""); setNotes(""); setPaymentMethodId("");
      await load();
      await Swal.fire({ icon: "success", title: paymentMode === "credit" ? "Deuda por insumos registrada" : "Entrega registrada", text: paymentMode === "credit" ? "Se creó una única deuda por el total del lote." : undefined, timer: 1500, showConfirmButton: false });
    } catch (error) {
      await Swal.fire({ icon: "error", title: "No se pudo registrar", text: error instanceof Error ? error.message : "Error inesperado", confirmButtonColor: "#0f766e" });
    } finally { setSaving(false); }
  }

  return <section className="space-y-5">
    <header><p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Personal</p><h1 className="mt-1 text-2xl font-bold text-slate-950">Entregas de insumos</h1><p className="mt-1 max-w-3xl text-sm text-slate-600">Entrega productos previamente configurados en Catálogo → Productos. Una entrega puede tener varios artículos y generar una sola deuda.</p></header>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-semibold">Nueva entrega</h2><p className="text-sm text-slate-500">El precio proviene del catálogo interno y queda auditado por línea.</p></div><strong className="text-lg text-emerald-700">Total: {formatMoney(total)}</strong></div>
      <div className="grid gap-3 md:grid-cols-3"><label className="text-sm font-medium">Empleado<Select value={employeeId} onChange={(event) => { const employee = data?.employees.find((item) => item.id === event.target.value); setEmployeeId(event.target.value); if (employee) setBranchId(employee.branch_id); }}><option value="">Seleccionar empleado</option>{data?.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}</Select></label><label className="text-sm font-medium">Sede<Select value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">Seleccionar sede</option>{data?.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</Select></label><label className="text-sm font-medium">Forma de cobro<Select value={paymentMode} onChange={(event) => setPaymentMode(event.target.value as "credit" | "immediate")}><option value="credit">Descontar como deuda</option><option value="immediate">Pago inmediato</option></Select></label></div>
      {paymentMode === "immediate" ? <div className="mt-3 grid gap-3 md:grid-cols-2"><label className="text-sm font-medium">Método de pago<Select value={paymentMethodId} onChange={(event) => setPaymentMethodId(event.target.value)}><option value="">Seleccionar método</option>{data?.paymentMethods.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}</Select></label><Input placeholder="Referencia de pago (opcional)" value={reference} onChange={(event) => setReference(event.target.value)} /></div> : <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Se creará una única deuda por el total de esta entrega.</p>}
      <div className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">{cart.length === 0 ? <p className="text-sm text-slate-500">Agrega los productos entregados.</p> : cart.map((line, index) => <div key={`${line.catalogItemId}-${index}`} className="grid items-end gap-2 md:grid-cols-[1fr_130px_140px_auto]"><label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Producto<Select value={line.catalogItemId} onChange={(event) => updateLine(index, "catalogItemId", event.target.value)}>{activeCatalog.map((item) => <option key={item.id} value={item.id}>{productName(item)}</option>)}</Select></label><label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cantidad<Input type="number" min="0.01" step="0.01" value={line.quantity} onChange={(event) => updateLine(index, "quantity", event.target.value)} /></label><p className="h-11 rounded-md border border-slate-200 bg-white px-3 py-3 text-right text-sm font-semibold">{formatMoney(Number(line.item?.employee_unit_price ?? 0) * Number(line.quantity || 0))}</p><Button className="h-11 bg-rose-100 text-rose-700 hover:bg-rose-200" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}>Quitar</Button></div>)}<Button className="bg-white text-slate-700 hover:bg-slate-100" disabled={activeCatalog.length === lines.length} onClick={addLine}>+ Agregar producto</Button></div>
      <Textarea className="mt-3" placeholder="Observación (opcional)" value={notes} onChange={(event) => setNotes(event.target.value)} /><div className="mt-3 flex justify-end"><Button disabled={saving || cart.length === 0} onClick={() => void submit()}>{saving ? "Guardando..." : paymentMode === "credit" ? "Registrar deuda por insumos" : "Registrar entrega"}</Button></div>
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold">Últimas entregas</h2><div className="mt-3 grid gap-2 md:grid-cols-3">{(data?.batches ?? []).length === 0 ? <p className="text-sm text-slate-500">No hay entregas registradas.</p> : data?.batches.map((batch) => { const status = batchStatus(batch); return <article key={batch.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="flex items-start justify-between gap-2"><p className="font-medium">{batchEmployeeName(batch)}</p><span className={`rounded-full px-2 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span></div><p className="mt-1 text-sm text-slate-600">{batch.status === "waived" ? "Cobro/deuda dejada sin efecto" : batch.payment_mode === "credit" ? "Deuda por insumos" : "Pago inmediato"}</p>{batch.status_reason ? <p className="mt-1 text-xs text-slate-500">Motivo: {batch.status_reason}</p> : null}<strong className="mt-1 block text-emerald-700">{formatMoney(Number(batch.total_charge_amount))}</strong><p className="mt-1 text-xs text-slate-500">{new Date(batch.created_at).toLocaleString("es-PE")}</p></article>; })}</div></section>
  </section>;
}
