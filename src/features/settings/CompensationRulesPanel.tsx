"use client";

import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/select";

export type CompensationKind =
  | "operational"
  | "reward"
  | "courtesy"
  | "product_bonus"
  | "supply_markup";

type Rule = Record<string, unknown> & { id: string; name: string; is_active: boolean; priority: number };
type Option = { id: string; name: string };

const kindLabels: Record<CompensationKind, string> = {
  operational: "Aportes operativos",
  reward: "Comisiones rewards",
  courtesy: "Comisiones cortesias",
  product_bonus: "Bonos productos",
  supply_markup: "Recargos insumos",
};

const emptyForm = {
  id: "",
  name: "",
  scope_type: "global",
  scope_id: "",
  calculation_type: "fixed",
  value: "",
  minimum_amount: "0",
  maximum_amount: "",
  priority: "0",
  effective_from: new Date().toISOString().slice(0, 10),
  effective_to: "",
  is_active: true,
};

type CompensationRulesPanelProps = {
  kind: CompensationKind;
};

export function CompensationRulesPanel({ kind }: CompensationRulesPanelProps) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [options, setOptions] = useState<{
    services: Option[];
    serviceCategories: Option[];
    products: Option[];
    productCategories: Option[];
  }>({ services: [], serviceCategories: [], products: [], productCategories: [] });
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/compensation-rules/${kind}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setRules(payload.data ?? []);
      setOptions(payload.options);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudieron cargar las reglas.";
      console.error("[compensation-rules/ui] Error", { kind, message });
    } finally {
      setLoading(false);
    }
  }

  // La consulta depende de la familia de reglas seleccionada.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [kind]);

  function edit(rule: Rule) {
    const serviceId = String(rule.service_id ?? "");
    const serviceCategoryId = String(rule.service_category_id ?? "");
    const productId = String(rule.product_id ?? "");
    const productCategoryId = String(rule.product_category_id ?? "");
    setForm({
      id: rule.id,
      name: rule.name,
      scope_type: serviceId ? "service" : productId ? "product" : serviceCategoryId || productCategoryId ? "category" : "global",
      scope_id: serviceId || productId || serviceCategoryId || productCategoryId,
      calculation_type: String(rule.calculation_type ?? rule.markup_type ?? "fixed"),
      value: String(rule.calculation_value ?? rule.fixed_commission_amount ?? rule.bonus_value ?? rule.markup_value ?? ""),
      minimum_amount: String(rule.minimum_amount ?? 0),
      maximum_amount: String(rule.maximum_amount ?? ""),
      priority: String(rule.priority ?? 0),
      effective_from: String(rule.effective_from ?? new Date().toISOString().slice(0, 10)),
      effective_to: String(rule.effective_to ?? ""),
      is_active: rule.is_active,
    });
    setOpen(true);
  }

  async function save() {
    if (!form.name.trim() || !form.value) {
      await Swal.fire({ icon: "warning", title: "Faltan datos", text: "Nombre y valor son obligatorios.", confirmButtonColor: "#0f766e" });
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/compensation-rules/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setOpen(false);
      await load();
    } catch (error) {
      await Swal.fire({
        icon: "error",
        title: "No se pudo guardar",
        text: error instanceof Error ? error.message : "Error inesperado",
        confirmButtonColor: "#0f766e",
      });
    } finally {
      setSaving(false);
    }
  }

  async function toggle(rule: Rule) {
    const result = await Swal.fire({
      icon: "question",
      title: rule.is_active ? "Desactivar regla" : "Activar regla",
      text: "Los snapshots historicos no cambiaran.",
      showCancelButton: true,
      confirmButtonText: rule.is_active ? "Desactivar" : "Activar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#0f766e",
    });
    if (!result.isConfirmed) return;
    await fetch(`/api/admin/compensation-rules/${kind}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rule.id, is_active: !rule.is_active }),
    });
    await load();
  }

  const scopeOptions =
    kind === "reward" || kind === "courtesy"
      ? form.scope_type === "service"
        ? options.services
        : options.serviceCategories
      : kind === "product_bonus" || kind === "supply_markup"
        ? form.scope_type === "product"
          ? options.products
          : options.productCategories
        : [];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">{kindLabels[kind]}</p>
          <p className="mt-1 text-sm text-slate-600">Reglas editables con vigencia y prioridad.</p>
        </div>
        <Button type="button" onClick={() => { setForm(emptyForm); setOpen(true); }}>
          Nueva regla
        </Button>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[650px] text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="pb-2">Regla</th>
              <th>Prioridad</th>
              <th>Estado</th>
              <th className="text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={4} className="py-6 text-center">Cargando reglas...</td></tr>
            ) : (
              rules.map((rule) => (
                <tr key={rule.id}>
                  <td className="py-3 font-medium">{rule.name}</td>
                  <td>{rule.priority}</td>
                  <td>{rule.is_active ? "Activa" : "Inactiva"}</td>
                  <td>
                    <div className="flex justify-end gap-2">
                      <Button type="button" className="h-8 px-3 text-xs" onClick={() => edit(rule)}>
                        Editar
                      </Button>
                      <Button
                        type="button"
                        className="h-8 bg-slate-100 px-3 text-xs text-slate-700"
                        onClick={() => void toggle(rule)}
                      >
                        {rule.is_active ? "Desactivar" : "Activar"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={open}
        title={form.id ? "Editar regla" : "Nueva regla"}
        onClose={() => setOpen(false)}
        isDirty={Boolean(form.name || form.value)}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" className="bg-white text-slate-700" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={saving} onClick={() => void save()}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm sm:col-span-2">
            Nombre
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>

          {kind !== "operational" ? (
            <label className="space-y-1 text-sm">
              Alcance
              <Select
                value={form.scope_type}
                onChange={(e) => setForm({ ...form, scope_type: e.target.value, scope_id: "" })}
              >
                <option value="global">Global</option>
                {kind === "reward" || kind === "courtesy" ? (
                  <option value="service">Servicio</option>
                ) : (
                  <option value="product">Producto</option>
                )}
                <option value="category">Categoria</option>
              </Select>
            </label>
          ) : null}

          {kind !== "operational" && form.scope_type !== "global" ? (
            <label className="space-y-1 text-sm">
              Seleccion
              <Select value={form.scope_id} onChange={(e) => setForm({ ...form, scope_id: e.target.value })}>
                <option value="">Seleccionar</option>
                {scopeOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </Select>
            </label>
          ) : null}

          {kind === "operational" ? (
            <>
              <label className="space-y-1 text-sm">
                Monto minimo
                <Input type="number" value={form.minimum_amount} onChange={(e) => setForm({ ...form, minimum_amount: e.target.value })} />
              </label>
              <label className="space-y-1 text-sm">
                Monto maximo
                <Input type="number" value={form.maximum_amount} onChange={(e) => setForm({ ...form, maximum_amount: e.target.value })} />
              </label>
            </>
          ) : null}

          {kind === "operational" || kind === "supply_markup" ? (
            <label className="space-y-1 text-sm">
              Calculo
              <Select value={form.calculation_type} onChange={(e) => setForm({ ...form, calculation_type: e.target.value })}>
                <option value="fixed">Monto fijo</option>
                <option value="percentage">Porcentaje</option>
              </Select>
            </label>
          ) : null}

          <label className="space-y-1 text-sm">
            Valor
            <Input type="number" min="0" step="0.01" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
          </label>
          <label className="space-y-1 text-sm">
            Prioridad
            <Input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
          </label>
          <label className="space-y-1 text-sm">
            Vigente desde
            <Input type="date" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} />
          </label>
          <label className="space-y-1 text-sm">
            Vigente hasta
            <Input type="date" value={form.effective_to} onChange={(e) => setForm({ ...form, effective_to: e.target.value })} />
          </label>
        </div>
      </Modal>
    </section>
  );
}