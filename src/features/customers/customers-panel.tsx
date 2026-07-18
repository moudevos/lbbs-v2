"use client";

import { faMagnifyingGlass, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { CustomerFormModal } from "@/features/customers/CustomerFormModal";
import { CustomersTable } from "@/features/customers/CustomersTable";
import type { CustomerFormValue, CustomerRecord } from "@/features/customers/customer-types";
import { normalizeLookupDocument, validateCustomerDocument } from "@/lib/utils/document";
import { normalizePhone } from "@/lib/utils/phone";

const emptyForm: CustomerFormValue = {
  first_name: "",
  last_name: "",
  business_name: "",
  phone: "",
  email: "",
  document_type: "",
  document_number: "",
  birthdate: "",
  notes: "",
};

function toFormValue(customer?: CustomerRecord | null): CustomerFormValue {
  if (!customer) {
    return emptyForm;
  }

  return {
    first_name: customer.first_name ?? "",
    last_name: customer.last_name ?? "",
    business_name: customer.business_name ?? "",
    phone: customer.phone,
    email: customer.email ?? "",
    document_type: customer.document_type ?? "",
    document_number: customer.document_number ?? "",
    birthdate: customer.birthdate ?? "",
    notes: customer.notes ?? "",
  };
}

function normalizeText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function confirmToggleCustomer(isActive: boolean) {
  const result = await Swal.fire({
    icon: "question",
    title: isActive ? "Inactivar cliente" : "Reactivar cliente",
    text: isActive
      ? "El cliente quedara inactivo para los siguientes modulos."
      : "El cliente volvera a quedar disponible.",
    showCancelButton: true,
    confirmButtonText: isActive ? "Inactivar" : "Reactivar",
    cancelButtonText: "Cancelar",
    confirmButtonColor: "#0f766e",
    background: "#ffffff",
    color: "#0f172a",
  });

  return result.isConfirmed;
}

export function CustomersPanel() {
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [form, setForm] = useState<CustomerFormValue>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLookingUpDocument, setIsLookingUpDocument] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);

  async function loadData() {
    setIsLoading(true);

    try {
      const customersResponse = await fetch("/api/admin/customers", { cache: "no-store" });
      const customersPayload = await customersResponse.json();

      if (!customersResponse.ok) {
        throw new Error(customersPayload.error || "No se pudieron cargar los clientes.");
      }

      setCustomers(customersPayload.data ?? []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[customers/ui] Error al cargar clientes", { message });
      await Swal.fire({
        icon: "error",
        title: "No se pudieron cargar los clientes",
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

  const visibleCustomers = useMemo(() => {
    const term = search.trim().toLowerCase();

    return customers.filter((customer) => {
      const matchesTerm =
        !term ||
        customer.full_name.toLowerCase().includes(term) ||
        customer.phone.toLowerCase().includes(term) ||
        customer.phone_normalized.includes(term.replace(/\D/g, "")) ||
        (customer.document_number ?? "").toLowerCase().includes(term) ||
        (customer.email ?? "").toLowerCase().includes(term);

      const matchesStatus =
        !statusFilter ||
        (statusFilter === "active" && customer.is_active) ||
        (statusFilter === "inactive" && !customer.is_active);

      return matchesTerm && matchesStatus;
    });
  }, [customers, search, statusFilter]);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setIsFormOpen(true);
  }

  function startEdit(customer: CustomerRecord) {
    setEditingId(customer.id);
    setForm(toFormValue(customer));
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
  }

  async function applyLookupResult(nextValues: Partial<CustomerFormValue>) {
    const hasCurrentData =
      Boolean(form.first_name.trim()) ||
      Boolean(form.last_name.trim()) ||
      Boolean(form.business_name.trim()) ||
      Boolean(form.email.trim()) ||
      Boolean(form.birthdate) ||
      Boolean(form.notes.trim());

    const firstNameChanged =
      typeof nextValues.first_name === "string" &&
      nextValues.first_name.trim() !== form.first_name.trim();
    const lastNameChanged =
      typeof nextValues.last_name === "string" &&
      nextValues.last_name.trim() !== form.last_name.trim();
    const businessNameChanged =
      typeof nextValues.business_name === "string" &&
      nextValues.business_name.trim() !== form.business_name.trim();

    if (hasCurrentData && (firstNameChanged || lastNameChanged || businessNameChanged)) {
      const result = await Swal.fire({
        icon: "question",
        title: "Confirmar autocompletado",
        text: "Ya existen datos cargados en el formulario. ¿Deseas reemplazarlos con el resultado encontrado?",
        showCancelButton: true,
        confirmButtonText: "Reemplazar",
        cancelButtonText: "Mantener manual",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });

      if (!result.isConfirmed) {
        return;
      }
    }

    setForm((current) => ({
      ...current,
      ...nextValues,
    }));
  }

  async function handleLookupDocument() {
    const documentType = form.document_type;
    const normalizedDocument = normalizeLookupDocument(documentType, form.document_number);

    if (documentType !== "DNI" && documentType !== "RUC") {
      return;
    }

    if (documentType === "DNI" && normalizedDocument.length !== 8) {
      await Swal.fire({
        icon: "warning",
        title: "DNI invalido",
        text: "Ingresa un DNI de 8 digitos para consultar.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    if (documentType === "RUC" && normalizedDocument.length !== 11) {
      await Swal.fire({
        icon: "warning",
        title: "RUC invalido",
        text: "Ingresa un RUC de 11 digitos para consultar.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    setIsLookingUpDocument(true);

    try {
      const response = await fetch("/api/customers/lookup-document", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          document_type: documentType,
          document_number: normalizedDocument,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            "No se pudo consultar el documento en este momento. Puedes registrar el cliente manualmente.",
        );
      }

      if (result.source === "customer" && result.customer) {
        await Swal.fire({
          icon: "info",
          title: "Cliente encontrado en la base de datos.",
          text: "Se cargaron los datos existentes en el formulario.",
          confirmButtonColor: "#0f766e",
          background: "#ffffff",
          color: "#0f172a",
        });

        await applyLookupResult(toFormValue(result.customer as CustomerRecord));
        return;
      }

      if (!result.found) {
        await Swal.fire({
          icon: "info",
          title: "Sin resultados",
          text: "No se encontraron datos para este documento. Completa el cliente manualmente.",
          confirmButtonColor: "#0f766e",
          background: "#ffffff",
          color: "#0f172a",
        });
        return;
      }

      const fullName =
        (result.data?.full_name as string | null | undefined) ??
        (result.data?.business_name as string | null | undefined) ??
        "";

      if (fullName || result.data?.first_name || result.data?.business_name) {
        await applyLookupResult({
          first_name: (result.data?.first_name as string | null | undefined) ?? "",
          last_name: (result.data?.last_name as string | null | undefined) ?? "",
          business_name:
            (result.data?.business_name as string | null | undefined) ??
            (documentType === "RUC" ? fullName : ""),
          document_number: normalizedDocument,
          document_type: documentType,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[customers/ui] Error al consultar documento", {
        documentType,
        message,
      });
      await Swal.fire({
        icon: "error",
        title: "Consulta no disponible",
        text: "No se pudo consultar el documento en este momento. Puedes registrar el cliente manualmente.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } finally {
      setIsLookingUpDocument(false);
    }
  }

  async function handleSave() {
    const isBusinessDocument = form.document_type === "RUC";
    const hasPersonName = Boolean(form.first_name.trim());
    const hasBusinessName = Boolean(form.business_name.trim());

    if ((isBusinessDocument && !hasBusinessName) || (!isBusinessDocument && !hasPersonName)) {
      await Swal.fire({
        icon: "warning",
        title: "Falta el nombre",
        text: isBusinessDocument
          ? "La razon social es obligatoria."
          : "Los nombres del cliente son obligatorios.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    if (!form.phone.trim()) {
      await Swal.fire({
        icon: "warning",
        title: "Falta el telefono",
        text: "El telefono es obligatorio.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    const phoneNormalized = normalizePhone(form.phone);
    if (phoneNormalized.length < 9) {
      await Swal.fire({
        icon: "warning",
        title: "Telefono invalido",
        text: "El telefono normalizado debe tener al menos 9 digitos.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    if (form.email.trim() && !isValidEmail(form.email.trim())) {
      await Swal.fire({
        icon: "warning",
        title: "Email invalido",
        text: "Ingresa un correo valido o deja el campo vacio.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    if (form.birthdate && form.birthdate > new Date().toISOString().slice(0, 10)) {
      await Swal.fire({
        icon: "warning",
        title: "Fecha invalida",
        text: "La fecha de nacimiento no puede ser futura.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    const documentError = validateCustomerDocument(form.document_type, form.document_number);
    if (documentError) {
      await Swal.fire({
        icon: "warning",
        title: "Documento invalido",
        text: documentError,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    setIsSaving(true);

    try {
      const payload = {
        first_name: normalizeText(form.first_name),
        last_name: normalizeText(form.last_name),
        business_name: normalizeText(form.business_name),
        phone: form.phone.trim(),
        email: normalizeText(form.email)?.toLowerCase() ?? null,
        document_type: normalizeText(form.document_type),
        document_number: normalizeText(form.document_number),
        birthdate: normalizeText(form.birthdate),
        notes: normalizeText(form.notes),
      };

      const response = await fetch(
        editingId ? `/api/admin/customers/${editingId}` : "/api/admin/customers",
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
        throw new Error(result.error || "No se pudo guardar el cliente.");
      }

      await Swal.fire({
        icon: "success",
        title: editingId ? "Cliente actualizado" : "Cliente creado",
        text: editingId
          ? "El cliente quedo actualizado."
          : "El cliente quedo registrado.",
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
      console.error("[customers/ui] Error al guardar cliente", { message });
      await Swal.fire({
        icon: "error",
        title: "No se pudo guardar el cliente",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleCustomer(customer: CustomerRecord) {
    const confirmed = await confirmToggleCustomer(customer.is_active);
    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/customers/${customer.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          first_name: customer.first_name,
          last_name: customer.last_name,
          business_name: customer.business_name,
          phone: customer.phone,
          email: customer.email,
          document_type: customer.document_type,
          document_number: customer.document_number,
          birthdate: customer.birthdate,
          notes: customer.notes,
          is_active: !customer.is_active,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "No se pudo cambiar el estado.");
      }

      await loadData();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[customers/ui] Error al cambiar estado", { message });
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
              <p className="text-sm font-semibold text-slate-900">Busqueda y filtros</p>
              <p className="mt-1 text-sm text-slate-600">
                Busca por nombre, telefono, documento o email.
              </p>
            </div>

            <Button type="button" onClick={startCreate} className="w-full lg:w-auto">
              <FontAwesomeIcon icon={faPlus} />
              Nuevo cliente
            </Button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="relative block sm:col-span-2 lg:col-span-3">
              <FontAwesomeIcon
                icon={faMagnifyingGlass}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar cliente..."
                className="pl-10"
              />
            </label>

            <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">Todos los estados</option>
              <option value="active">Activo</option>
              <option value="inactive">Inactivo</option>
            </Select>
          </div>
        </section>

        {isLoading ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-600">Cargando clientes...</p>
          </section>
        ) : (
          <CustomersTable
            customers={visibleCustomers}
            onEdit={startEdit}
            onToggleActive={toggleCustomer}
          />
        )}
      </div>

      <CustomerFormModal
        open={isFormOpen}
        value={form}
        isSaving={isSaving}
        isLookingUpDocument={isLookingUpDocument}
        isEditing={Boolean(editingId)}
        onClose={closeForm}
        onChange={setForm}
        onLookupDocument={handleLookupDocument}
        onSubmit={handleSave}
        onReset={startCreate}
      />
    </>
  );
}
