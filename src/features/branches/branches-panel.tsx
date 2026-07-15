"use client";

import { faMagnifyingGlass, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";

import { BranchFormModal } from "@/features/branches/branch-form-modal";
import { BranchesTable } from "@/features/branches/branches-table";
import type { BranchFormValue, BranchRecord } from "@/features/branches/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeSlug } from "@/lib/utils/slug";
import { BranchDetailsModal } from "./branch-details-modal";

const emptyForm: BranchFormValue = {
  code: "",
  name: "",
  slug: "",
  short_name: "",
  city: "",
  address: "",
  phone: "",
  notes: "",
  is_active: true,
};

function toFormValue(branch?: BranchRecord | null): BranchFormValue {
  if (!branch) {
    return emptyForm;
  }

  return {
    code: branch.code ?? "",
    name: branch.name,
    slug: branch.slug,
    short_name: branch.short_name ?? "",
    city: branch.city ?? "",
    address: branch.address ?? "",
    phone: branch.phone ?? "",
    notes: branch.notes ?? "",
    is_active: branch.is_active,
  };
}

function normalizeText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function confirmToggleState(isActive: boolean) {
  const result = await Swal.fire({
    icon: "question",
    title: isActive ? "Desactivar sede" : "Activar sede",
    text: isActive
      ? "La sede quedará inactiva hasta que la vuelvas a habilitar."
      : "La sede volverá a estar disponible en el panel.",
    showCancelButton: true,
    confirmButtonText: isActive ? "Desactivar" : "Activar",
    cancelButtonText: "Cancelar",
    confirmButtonColor: "#0f766e",
    background: "#ffffff",
    color: "#0f172a",
  });

  return result.isConfirmed;
}

export function BranchesPanel() {
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<BranchFormValue>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  async function loadBranches() {
    setIsLoading(true);

    try {
      const response = await fetch("/api/admin/branches", {
        cache: "no-store",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "No se pudieron cargar las sedes.");
      }

      setBranches(payload.data ?? []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[branches/ui] Error al cargar sedes", { message });
      await Swal.fire({
        icon: "error",
        title: "No se pudieron cargar las sedes",
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
      void loadBranches();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const visibleBranches = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return branches;
    }

    return branches.filter((branch) => {
      return (
        branch.name.toLowerCase().includes(term) ||
        branch.slug.toLowerCase().includes(term) ||
        (branch.code ?? "").toLowerCase().includes(term) ||
        (branch.city ?? "").toLowerCase().includes(term)
      );
    });
  }, [branches, search]);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setIsFormOpen(true);
  }

  function startEdit(branch: BranchRecord) {
    setEditingId(branch.id);
    setForm(toFormValue(branch));
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.slug.trim()) {
      await Swal.fire({
        icon: "warning",
        title: "Faltan datos",
        text: "Nombre y slug son obligatorios.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    setIsSaving(true);

    try {
      const payload = {
        code: normalizeText(form.code),
        name: form.name.trim(),
        slug: normalizeSlug(form.slug),
        short_name: normalizeText(form.short_name),
        city: normalizeText(form.city),
        address: normalizeText(form.address),
        phone: normalizeText(form.phone),
        notes: normalizeText(form.notes),
        is_active: form.is_active,
      };

      const response = await fetch(
        editingId ? `/api/admin/branches/${editingId}` : "/api/admin/branches",
        {
          method: editingId ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "No se pudo guardar la sede.");
      }

      await Swal.fire({
        icon: "success",
        title: editingId ? "Sede actualizada" : "Sede creada",
        text: editingId ? "La sede quedó actualizada." : "La sede quedó registrada.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });

      closeForm();
      setForm(emptyForm);
      setEditingId(null);
      await loadBranches();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[branches/ui] Error al guardar sede", { message });
      await Swal.fire({
        icon: "error",
        title: "No se pudo guardar la sede",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleBranch(branch: BranchRecord) {
    const confirmed = await confirmToggleState(branch.is_active);
    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/branches/${branch.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...branch,
          is_active: !branch.is_active,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "No se pudo cambiar el estado.");
      }

      await loadBranches();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[branches/ui] Error al cambiar estado", { message });
      await Swal.fire({
        icon: "error",
        title: "No se pudo cambiar el estado",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    }
  }

  const [viewingBranch, setViewingBranch] = useState<BranchRecord | null>(null);

  function openDetails(branch: BranchRecord) {
    setViewingBranch(branch);
  }

  function closeDetails() {
    setViewingBranch(null);
  }

  return (
    <>
      <div className="w-full space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">Búsqueda</p>
              <p className="mt-1 text-sm text-slate-600">
                Filtra por nombre, código o ciudad.
              </p>
            </div>

            <Button type="button" onClick={startCreate}>
              <FontAwesomeIcon icon={faPlus} />
              Nueva sede
            </Button>
          </div>

          <div className="mt-4">
            <label className="relative block">
              <FontAwesomeIcon
                icon={faMagnifyingGlass}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar sede..."
                className="pl-10"
              />
            </label>
          </div>
        </section>

        {isLoading ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-600">Cargando sedes...</p>
          </section>
        ) : (
          <BranchesTable
            branches={visibleBranches}
            onEdit={startEdit}
            onView={openDetails}
            onToggleActive={toggleBranch}
          />
        )}
      </div>

      <BranchDetailsModal
        open={Boolean(viewingBranch)}
        branch={viewingBranch}
        onClose={closeDetails}
      />

      <BranchFormModal
        open={isFormOpen}
        value={form}
        isSaving={isSaving}
        isEditing={Boolean(editingId)}
        onClose={closeForm}
        onChange={setForm}
        onSubmit={handleSave}
        onReset={startCreate}
      />
    </>
  );
}
