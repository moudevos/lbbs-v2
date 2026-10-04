"use client";

import { faCircleQuestion, faMagnifyingGlass, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { CustomerFormModal } from "@/features/customers/CustomerFormModal";
import { CustomerProfileModal } from "@/features/customers/CustomerProfileModal";
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

/* Etiqueta "Buscar por" con un (?) que abre un globo explicando qué campos se consultan. */
function SearchHelp() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative flex shrink-0 items-center gap-1.5">
      <span className="text-sm font-semibold text-slate-900">Buscar</span>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label="¿Por qué datos se puede buscar?"
        className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
      >
        <FontAwesomeIcon icon={faCircleQuestion} className="h-4 w-4" />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Campos de búsqueda"
          className="absolute left-0 top-full z-30 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-lg"
        >
          <span
            aria-hidden
            className="absolute -top-1.5 left-9 h-3 w-3 rotate-45 border-l border-t border-slate-200 bg-white"
          />
          <p className="font-medium text-slate-900">Se busca por</p>
          <ul className="mt-1.5 space-y-1 text-slate-600">
            <li>Nombre o razón social</li>
            <li>Teléfono</li>
            <li>Documento (DNI o RUC)</li>
            <li>Email</li>
          </ul>
        </div>
      ) : null}
    </div>
  );
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
  const [viewingCustomer, setViewingCustomer] = useState<CustomerRecord | null>(null);

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
        {/* Filtros: una sola fila, fija. Solo se desplaza la tabla de abajo. */}
        <section className="relative z-20 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <SearchHelp />

            <label className="relative block min-w-0 flex-1">
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

            <div className="lg:w-52 lg:shrink-0">
              <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="">Todos los estados</option>
                <option value="active">Activo</option>
                <option value="inactive">Inactivo</option>
              </Select>
            </div>

            <Button type="button" onClick={startCreate} className="w-full lg:w-auto lg:shrink-0">
              <FontAwesomeIcon icon={faPlus} />
              Nuevo cliente
            </Button>
          </div>
        </section>

        {isLoading ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-600">Cargando clientes...</p>
          </section>
        ) : (
          <CustomersTable
            customers={visibleCustomers}
            onView={setViewingCustomer}
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

      <CustomerProfileModal
        customer={viewingCustomer}
        onClose={() => setViewingCustomer(null)}
        onEdit={(customer) => {
          setViewingCustomer(null);
          startEdit(customer);
        }}
      />
    </>
  );
}