"use client";

import { faMagnifyingGlass, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmployeeFormModal } from "@/features/employees/employee-form-modal";
import { EmployeeFinanceModal } from "@/features/employees/EmployeeFinanceModal";
import { EmployeesTable } from "@/features/employees/employees-table";
import { canHavePanelAccess } from "@/lib/auth/panel-access";
import type { BranchRecord } from "@/features/branches/types";
import {
  isConfigurableCompensationMode,
  isFixedCompensationMode,
  type EmployeeCompensationTerm,
} from "@/features/employees/compensation";
import type { EmployeeFormValue, EmployeeRecord } from "@/features/employees/types";

const emptyForm: EmployeeFormValue = {
  full_name: "",
  document_type: "",
  document_number: "",
  email: "",
  phone: "",
  branch_id: "",
  role: "viewer",
  status: "active",
  position: "",
  notes: "",
  can_login: false,
  temporary_password: "",
  compensation_type: "",
  base_monthly_salary: "",
  mandatory_discount_enabled: true,
  mandatory_discount_rate: "1.00",
  compensation_effective_from: "",
};

function numberInput(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "";
  return String(Number(value));
}

function toFormValue(employee?: EmployeeRecord | null): EmployeeFormValue {
  if (!employee) {
    return emptyForm;
  }

  const compensation = employee.current_compensation;

  return {
    full_name: employee.full_name,
    document_type: (employee.document_type ?? "") as EmployeeFormValue["document_type"],
    document_number: employee.document_number ?? "",
    email: employee.email ?? "",
    phone: employee.phone ?? "",
    branch_id: employee.branch_id ?? "",
    role: employee.role,
    status: employee.status,
    position: employee.position ?? "",
    notes: employee.notes ?? "",
    can_login: employee.can_login,
    temporary_password: "",
    compensation_type: compensation?.compensation_mode ?? "",
    base_monthly_salary: numberInput(compensation?.base_monthly_salary),
    mandatory_discount_enabled: compensation?.mandatory_discount_enabled ?? true,
    mandatory_discount_rate: numberInput(compensation?.mandatory_discount_rate ?? 1),
    // Al editar, esta fecha representa una NUEVA vigencia. La fecha actual se
    // muestra por separado para no duplicar contratos al guardar solo el perfil.
    compensation_effective_from: "",
  };
}

function compensationChanged(
  form: EmployeeFormValue,
  current: EmployeeCompensationTerm | null,
) {
  if (!current) return form.compensation_type !== "";
  if (form.compensation_type !== current.compensation_mode) return true;

  if (
    isFixedCompensationMode(form.compensation_type)
    && Number(form.base_monthly_salary || 0) !== Number(current.base_monthly_salary ?? 0)
  ) {
    return true;
  }

  if (form.mandatory_discount_enabled !== Boolean(current.mandatory_discount_enabled)) {
    return true;
  }

  const nextRate = form.mandatory_discount_enabled
    ? Number(form.mandatory_discount_rate || 0)
    : 0;
  const currentRate = current.mandatory_discount_enabled
    ? Number(current.mandatory_discount_rate ?? 0)
    : 0;

  return Math.abs(nextRate - currentRate) > 0.0001;
}

function normalizeText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function confirmStatusChange(nextStatus: EmployeeRecord["status"]) {
  const statusText = {
    active: "activar",
    inactive: "inactivar",
    blocked: "bloquear",
  }[nextStatus];

  const result = await Swal.fire({
    icon: "question",
    title: `Confirmar ${statusText}`,
    text: `El empleado cambiará a estado ${nextStatus === "active" ? "activo" : nextStatus === "inactive" ? "inactivo" : "bloqueado"}.`,
    showCancelButton: true,
    confirmButtonText: "Confirmar",
    cancelButtonText: "Cancelar",
    confirmButtonColor: "#0f766e",
    background: "#ffffff",
    color: "#0f172a",
  });

  return result.isConfirmed;
}

export function EmployeesPanel() {
  const [viewingEmployee, setViewingEmployee] = useState<EmployeeRecord | null>(null);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [form, setForm] = useState<EmployeeFormValue>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  async function loadData() {
    setIsLoading(true);

    try {
      const [employeesResponse, branchesResponse] = await Promise.all([
        fetch("/api/admin/employees", { cache: "no-store" }),
        fetch("/api/admin/branches", { cache: "no-store" }),
      ]);

      const employeesPayload = await employeesResponse.json();
      const branchesPayload = await branchesResponse.json();

      if (!employeesResponse.ok) {
        throw new Error(employeesPayload.error || "No se pudo cargar el equipo.");
      }

      if (!branchesResponse.ok) {
        throw new Error(branchesPayload.error || "No se pudieron cargar las sedes.");
      }

      setEmployees(employeesPayload.data ?? []);
      setBranches(branchesPayload.data ?? []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[employees/ui] Error al cargar equipo", { message });
      await Swal.fire({
        icon: "error",
        title: "No se pudo cargar el equipo",
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
      void loadData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const visibleEmployees = useMemo(() => {
    const term = search.trim().toLowerCase();

    return employees.filter((employee) => {
      const matchesTerm =
        !term ||
        employee.full_name.toLowerCase().includes(term) ||
        (employee.email ?? "").toLowerCase().includes(term) ||
        (employee.document_number ?? "").toLowerCase().includes(term) ||
        (employee.phone ?? "").toLowerCase().includes(term);

      const matchesRole = !roleFilter || employee.role === roleFilter;
      const matchesBranch = !branchFilter || employee.branch_id === branchFilter;
      const matchesStatus = !statusFilter || employee.status === statusFilter;

      return matchesTerm && matchesRole && matchesBranch && matchesStatus;
    });
  }, [employees, search, roleFilter, branchFilter, statusFilter]);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setIsFormOpen(true);
  }

  function startEdit(employee: EmployeeRecord) {
    setEditingId(employee.id);
    setForm(toFormValue(employee));
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
  }

  async function sendPasswordRecovery(employee: EmployeeRecord) {
    const confirmation = await Swal.fire({
      icon: "question",
      title: "Solicitar recuperación",
      text: `Se solicitará el envío de un enlace de recuperación para ${employee.full_name}.`,
      showCancelButton: true,
      confirmButtonText: "Solicitar envío",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#0f766e",
    });
    if (!confirmation.isConfirmed) return;
    try {
      const response = await fetch(`/api/admin/employees/${employee.id}/send-password-recovery`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo solicitar el envío.");
      await Swal.fire({ icon: "success", title: "Solicitud registrada", text: "Se solicitó el envío del enlace de recuperación.", confirmButtonColor: "#0f766e" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo solicitar el envío.";
      console.error("[employees/ui] Error al solicitar recuperación", { message, employeeId: employee.id });
      await Swal.fire({ icon: "error", title: "No se pudo solicitar la recuperación", text: message, confirmButtonColor: "#0f766e" });
    }
  }

  async function handleSave() {
    if (!form.full_name.trim() || !form.email.trim()) {
      await Swal.fire({
        icon: "warning",
        title: "Faltan datos",
        text: "Nombre y email son obligatorios.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    if (!editingId && form.can_login && !form.temporary_password.trim()) {
      await Swal.fire({
        icon: "warning",
        title: "Falta la contraseña temporal",
        text: "La contraseña temporal es obligatoria al crear un empleado con acceso.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    if (form.can_login && !canHavePanelAccess(form.role)) {
      await Swal.fire({
        icon: "warning",
        title: "Rol sin acceso",
        text: "Solo owner, administrador y recepcion pueden iniciar sesion.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    const editingEmployee = editingId
      ? employees.find((employee) => employee.id === editingId) ?? null
      : null;
    const currentCompensation = editingEmployee?.current_compensation ?? null;
    const shouldSaveCompensation = editingId
      ? compensationChanged(form, currentCompensation)
      : form.compensation_type !== "";

    if (shouldSaveCompensation && !isConfigurableCompensationMode(form.compensation_type)) {
      await Swal.fire({
        icon: "warning",
        title: "Selecciona una remuneración vigente",
        text: "Elige uno de los tipos actuales de remuneración para registrar una nueva condición.",
        confirmButtonColor: "#0f766e",
      });
      return;
    }

    if (shouldSaveCompensation && !form.compensation_effective_from) {
      await Swal.fire({
        icon: "warning",
        title: "Falta la fecha de vigencia",
        text: editingId
          ? "Los datos generales pueden actualizarse sin tocar la remuneración. Si cambias la remuneración, indica desde qué fecha aplicará la nueva condición."
          : "Indica desde qué fecha aplicará la remuneración seleccionada.",
        confirmButtonColor: "#0f766e",
      });
      return;
    }

    if (shouldSaveCompensation && isFixedCompensationMode(form.compensation_type) && Number(form.base_monthly_salary) <= 0) {
      await Swal.fire({ icon: "warning", title: "Falta el sueldo mensual", text: "Fijo y Fijo + bonos requieren un sueldo base mensual mayor que cero.", confirmButtonColor: "#0f766e" });
      return;
    }

    if (shouldSaveCompensation && form.mandatory_discount_enabled && (Number(form.mandatory_discount_rate) < 0 || Number(form.mandatory_discount_rate) > 100)) {
      await Swal.fire({ icon: "warning", title: "Descuento obligatorio inválido", text: "Indica una tasa entre 0 y 100 %.", confirmButtonColor: "#0f766e" });
      return;
    }

    setIsSaving(true);

    try {
      const payload = {
        full_name: form.full_name.trim(),
        document_type: normalizeText(form.document_type),
        document_number: normalizeText(form.document_number),
        email: form.email.trim().toLowerCase(),
        phone: normalizeText(form.phone),
        branch_id: normalizeText(form.branch_id),
        role: form.role,
        status: form.status,
        position: normalizeText(form.position),
        notes: normalizeText(form.notes),
        can_login: form.can_login,
        temporary_password: form.temporary_password,
      };

      const response = await fetch(
        editingId ? `/api/admin/employees/${editingId}` : "/api/admin/employees",
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
        throw new Error(result.error || "No se pudo guardar el empleado.");
      }

      if (shouldSaveCompensation) {
        const compensationResponse = await fetch(`/api/admin/employees/${result.data.id}/compensation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            compensationMode: form.compensation_type,
            baseMonthlySalary: ["commission_plus_bonus", "commission_only"].includes(form.compensation_type) ? null : Number(form.base_monthly_salary),
            mandatoryDiscountEnabled: form.mandatory_discount_enabled,
            mandatoryDiscountRate: form.mandatory_discount_enabled ? Number(form.mandatory_discount_rate) : 0,
            effectiveFrom: form.compensation_effective_from,
            replaceCurrent: currentCompensation !== null,
          }),
        });
        const compensationResult = await compensationResponse.json();
        if (!compensationResponse.ok) throw new Error(compensationResult.error || "El empleado se guardó, pero no su condición de remuneración.");
      }

      await Swal.fire({
        icon: "success",
        title: editingId ? "Empleado actualizado" : "Empleado creado",
        text: editingId
          ? "El perfil quedó actualizado."
          : "El usuario Auth y el perfil quedaron creados.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });

      closeForm();
      setForm(emptyForm);
      setEditingId(null);
      await loadData();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[employees/ui] Error al guardar empleado", { message });
      await Swal.fire({
        icon: "error",
        title: "No se pudo guardar el empleado",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function changeStatus(employee: EmployeeRecord, nextStatus: EmployeeRecord["status"]) {
    const confirmed = await confirmStatusChange(nextStatus);
    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/employees/${employee.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...employee,
          status: nextStatus,
          temporary_password: "",
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "No se pudo cambiar el estado.");
      }

      await loadData();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[employees/ui] Error al cambiar estado", { message });
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

  return (
    <>
      <div className="w-full space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="text-sm font-semibold text-slate-900">Búsqueda y filtros</p>
              <p className="mt-1 text-sm text-slate-600">
                Filtra por nombre, email, documento, teléfono, rol, sede o estado.
              </p>
            </div>

            <Button type="button" onClick={startCreate} className="w-full lg:w-auto">
              <FontAwesomeIcon icon={faPlus} />
              Nuevo empleado
            </Button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="relative block sm:col-span-3 lg:col-span-1">
              <FontAwesomeIcon
                icon={faMagnifyingGlass}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar empleado..."
                className="pl-10"
              />
            </label>

            <Select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
              <option value="">Todos los roles</option>
              <option value="owner">Administrador principal</option>
              <option value="admin">Administrador</option>
              <option value="reception">Recepción</option>
              <option value="barber">Barbero</option>
              <option value="viewer">Visualizador</option>
            </Select>

            <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">Todos los estados</option>
              <option value="active">Activo</option>
              <option value="inactive">Inactivo</option>
              <option value="blocked">Bloqueado</option>
            </Select>

            <Select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}>
              <option value="">Todas las sedes</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </Select>
          </div>
        </section>

        {isLoading ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-600">Cargando equipo...</p>
          </section>
        ) : (
          <EmployeesTable
            employees={visibleEmployees}
            onEdit={startEdit}
            onStatusChange={changeStatus}
            onView={setViewingEmployee}
            onSendPasswordRecovery={(employee) => void sendPasswordRecovery(employee)}
          />
        )}
      </div>

      <EmployeeFormModal
        open={isFormOpen}
        value={form}
        branches={branches}
        isSaving={isSaving}
        isEditing={Boolean(editingId)}
        currentCompensation={editingId ? employees.find((employee) => employee.id === editingId)?.current_compensation ?? null : null}
        onClose={closeForm}
        onChange={setForm}
        onSubmit={handleSave}
        onReset={startCreate}
      />
      <EmployeeFinanceModal employee={viewingEmployee} onClose={() => setViewingEmployee(null)} />
    </>
  );
}
