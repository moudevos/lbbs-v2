"use client";

import { useEffect, useState } from "react";
import Swal from "sweetalert2";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { CashMovementFormModal } from "@/features/cash/CashMovementFormModal";
import { CashMovementsTable } from "@/features/cash/CashMovementsTable";
import { CashSessionSummary } from "@/features/cash/CashSessionSummary";
import {
  cancelCashMovement,
  createCashMovement,
  fetchCashBootstrap,
} from "@/features/cash/cash-actions";
import type {
  CashBootstrapPayload,
  CashFilters,
  CashMovementFormValue,
  CashMovementRecord,
} from "@/features/cash/cash-types";

const initialFilters: CashFilters = {
  branchId: "",
  date: "",
  movementType: "",
  status: "",
  categoryId: "",
};

const emptyMovementForm: CashMovementFormValue = {
  movement_type: "",
  category_id: "",
  amount: "",
  description: "",
  evidence_url: "",
};

export function CashPageClient() {
  const [filters, setFilters] = useState<CashFilters>(initialFilters);
  const [payload, setPayload] = useState<CashBootstrapPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCancelling, setIsCancelling] = useState<string | null>(null);
  const [form, setForm] = useState<CashMovementFormValue>(emptyMovementForm);

  async function loadData(nextFilters: CashFilters) {
    setIsLoading(true);

    try {
      const result = await fetchCashBootstrap(nextFilters);
      setPayload(result);
      setFilters((current) => ({
        ...current,
        branchId: result.selectedBranchId || current.branchId,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[cash/ui] Error al cargar caja", { message });
      await Swal.fire({
        icon: "error",
        title: "No se pudo cargar la caja operativa",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData(initialFilters);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const role = payload?.role ?? "viewer";
  const canManageAllBranches = role === "owner" || role === "admin";
  const branches = payload?.branches ?? [];
  const activeSession = payload?.activeSession ?? null;
  const categories = payload?.categories ?? [];
  const movements = payload?.movements ?? [];
  const summary = payload?.summary ?? null;

  const filteredCategories = form.movement_type
    ? categories.filter((category) => category.movement_direction === form.movement_type)
    : categories;

  async function refreshData(overrides?: Partial<CashFilters>) {
    const nextFilters = { ...filters, ...overrides };
    await loadData(nextFilters);
  }

  function openCreateModal() {
    if (!activeSession) {
      return;
    }

    setForm(emptyMovementForm);
    setIsFormOpen(true);
  }

  async function handleCreateMovement() {
    if (!activeSession) {
      await Swal.fire({
        icon: "info",
        title: "Sin sesion POS abierta",
        text: "Abre una sesion POS antes de registrar movimientos de caja.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    if (!form.movement_type) {
      await Swal.fire({
        icon: "warning",
        title: "Falta el tipo",
        text: "Selecciona el tipo de movimiento.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    if (!form.category_id && filteredCategories.length > 0) {
      await Swal.fire({
        icon: "warning",
        title: "Falta la categoria",
        text: "Selecciona una categoria para continuar.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    if (!form.amount.trim() || Number(form.amount) <= 0) {
      await Swal.fire({
        icon: "warning",
        title: "Monto invalido",
        text: "Ingresa un monto mayor a cero.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    if (!form.description.trim()) {
      await Swal.fire({
        icon: "warning",
        title: "Falta la descripcion",
        text: "Describe el motivo del movimiento.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    setIsSaving(true);

    try {
      await createCashMovement(activeSession.id, form);
      setIsFormOpen(false);
      setForm(emptyMovementForm);
      await refreshData();
      await Swal.fire({
        icon: "success",
        title: "Movimiento registrado",
        text: "La caja operativa se actualizo correctamente.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[cash/ui] Error al registrar movimiento", {
        message,
        sessionId: activeSession.id,
      });
      await Swal.fire({
        icon: "error",
        title: "No se pudo registrar el movimiento",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCancelMovement(movement: CashMovementRecord) {
    const result = await Swal.fire({
      icon: "warning",
      title: "Anular movimiento",
      input: "textarea",
      inputLabel: "Motivo obligatorio",
      inputPlaceholder: "Describe por que se anula este movimiento",
      showCancelButton: true,
      confirmButtonText: "Anular movimiento",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#dc2626",
      background: "#ffffff",
      color: "#0f172a",
      inputValidator: (value) => {
        if (!value.trim()) {
          return "Debes indicar el motivo de anulacion.";
        }

        return null;
      },
    });

    if (!result.isConfirmed || typeof result.value !== "string") {
      return;
    }

    setIsCancelling(movement.id);

    try {
      await cancelCashMovement(movement.id, result.value);
      await refreshData();
      await Swal.fire({
        icon: "success",
        title: "Movimiento anulado",
        text: "El movimiento ya no se considera en el cuadre de caja.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[cash/ui] Error al anular movimiento", {
        message,
        movementId: movement.id,
      });
      await Swal.fire({
        icon: "error",
        title: "No se pudo anular el movimiento",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } finally {
      setIsCancelling(null);
    }
  }

  return (
    <>
      <div className="space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">Caja operativa</p>
              <p className="mt-1 text-sm text-slate-600">
                Registra ingresos y egresos fuera del POS para ajustar el cuadre de la sesion abierta.
              </p>
              <p className="mt-2 text-xs text-amber-700">
                El egreso de caja no actualiza stock automaticamente. Si este gasto corresponde a compra de productos, registra tambien el ingreso en Stock desde Productos.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {canManageAllBranches ? (
                <Select
                  value={filters.branchId || payload?.selectedBranchId || ""}
                  onChange={(event) => {
                    const nextBranchId = event.target.value;
                    setFilters((current) => ({ ...current, branchId: nextBranchId }));
                    void refreshData({ branchId: nextBranchId });
                  }}
                  className="min-w-52"
                >
                  <option value="">Seleccionar sede</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </Select>
              ) : null}

              <Button type="button" onClick={openCreateModal} disabled={!activeSession}>
                Nuevo movimiento
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Input
              type="date"
              value={filters.date}
              onChange={(event) => setFilters((current) => ({ ...current, date: event.target.value }))}
            />
            <Select
              value={filters.movementType}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  movementType: event.target.value as CashFilters["movementType"],
                }))
              }
            >
              <option value="">Todos los tipos</option>
              <option value="income">Ingreso</option>
              <option value="expense">Egreso</option>
              <option value="withdrawal">Retiro</option>
              <option value="adjustment">Ajuste</option>
            </Select>
            <Select
              value={filters.status}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  status: event.target.value as CashFilters["status"],
                }))
              }
            >
              <option value="">Todos los estados</option>
              <option value="active">Activo</option>
              <option value="cancelled">Anulado</option>
            </Select>
            <Select
              value={filters.categoryId}
              onChange={(event) => setFilters((current) => ({ ...current, categoryId: event.target.value }))}
            >
              <option value="">Todas las categorias</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => {
                void refreshData();
              }}
              disabled={isLoading}
            >
              {isLoading ? "Cargando..." : "Aplicar filtros"}
            </Button>
            <Button
              type="button"
              className="bg-white text-slate-700 shadow-none hover:bg-slate-100"
              onClick={() => {
                setFilters((current) => ({
                  ...initialFilters,
                  branchId: canManageAllBranches ? current.branchId : current.branchId,
                }));
                void loadData({
                  ...initialFilters,
                  branchId: canManageAllBranches ? filters.branchId : filters.branchId,
                });
              }}
              disabled={isLoading}
            >
              Limpiar
            </Button>
          </div>
        </section>

        <CashSessionSummary summary={summary} />

        <CashMovementsTable
          movements={movements}
          isLoading={isLoading}
          onCancel={(movement) => {
            void handleCancelMovement(movement);
          }}
          cancellingId={isCancelling}
        />
      </div>

      <CashMovementFormModal
        open={isFormOpen}
        categories={categories}
        value={form}
        isSaving={isSaving}
        onClose={() => setIsFormOpen(false)}
        onChange={setForm}
        onSubmit={handleCreateMovement}
      />
    </>
  );
}
