"use client";

import { useState } from "react";
import Swal from "sweetalert2";

import { CustomerFormModal } from "@/features/customers/CustomerFormModal";
import type { CustomerFormValue, CustomerRecord } from "@/features/customers/customer-types";
import type { PosCustomerRecord } from "@/features/pos/pos-types";
import { normalizeLookupDocument } from "@/lib/utils/document";

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

type PosCustomerCreateModalProps = {
  open: boolean;
  initialQuery: string;
  onClose: () => void;
  onCreated: (customer: PosCustomerRecord) => void;
};

function getInitialForm(query: string): CustomerFormValue {
  const trimmed = query.trim();
  const digits = trimmed.replace(/\D/g, "");

  return {
    ...emptyForm,
    first_name: digits.length >= 9 ? "" : trimmed,
    phone: digits.length >= 9 ? trimmed : "",
  };
}

function toPosCustomer(customer: CustomerRecord): PosCustomerRecord {
  return {
    id: customer.id,
    full_name: customer.full_name,
    phone: customer.phone,
    document_number: customer.document_number,
    is_active: customer.is_active,
  };
}

export function PosCustomerCreateModal({ open, initialQuery, onClose, onCreated }: PosCustomerCreateModalProps) {
  const [form, setForm] = useState<CustomerFormValue>(() => getInitialForm(initialQuery));
  const [isSaving, setIsSaving] = useState(false);
  const [isLookingUpDocument, setIsLookingUpDocument] = useState(false);

  async function handleLookupDocument() {
    const documentType = form.document_type;
    const documentNumber = normalizeLookupDocument(documentType, form.document_number);
    if (documentType !== "DNI" && documentType !== "RUC") return;

    const expectedLength = documentType === "DNI" ? 8 : 11;
    if (documentNumber.length !== expectedLength) {
      await Swal.fire({ icon: "warning", title: `${documentType} invalido`, text: `Ingresa un ${documentType} de ${expectedLength} digitos para consultar.`, confirmButtonColor: "#0f766e" });
      return;
    }

    setIsLookingUpDocument(true);
    try {
      const response = await fetch("/api/customers/lookup-document", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document_type: documentType, document_number: documentNumber }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo consultar el documento.");

      if (result.source === "customer" && result.customer) {
        onCreated(toPosCustomer(result.customer as CustomerRecord));
        return;
      }
      if (!result.found) {
        await Swal.fire({ icon: "info", title: "Sin resultados", text: "Completa los datos para registrar al cliente.", confirmButtonColor: "#0f766e" });
        return;
      }

      const fullName = String(result.data?.full_name ?? result.data?.business_name ?? "");
      setForm((current) => ({ ...current, first_name: String(result.data?.first_name ?? ""), last_name: String(result.data?.last_name ?? ""), business_name: String(result.data?.business_name ?? (documentType === "RUC" ? fullName : "")), document_type: documentType, document_number: documentNumber }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[pos/customer-create] Error al consultar documento", { documentType, message });
      await Swal.fire({ icon: "error", title: "Consulta no disponible", text: "No se pudo consultar el documento. Puedes registrar el cliente manualmente.", confirmButtonColor: "#0f766e" });
    } finally {
      setIsLookingUpDocument(false);
    }
  }

  async function handleSubmit() {
    setIsSaving(true);
    try {
      const response = await fetch("/api/admin/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, source: "sale" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo crear el cliente.");
      onCreated(toPosCustomer(result.data as CustomerRecord));
      await Swal.fire({ icon: "success", title: "Cliente creado", text: "El cliente quedó seleccionado para esta venta.", confirmButtonColor: "#0f766e" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[pos/customer-create] Error al crear cliente", { message });
      await Swal.fire({ icon: "error", title: "No se pudo crear el cliente", text: message, confirmButtonColor: "#0f766e" });
    } finally {
      setIsSaving(false);
    }
  }

  return <CustomerFormModal open={open} value={form} isSaving={isSaving} isLookingUpDocument={isLookingUpDocument} isEditing={false} title="Nuevo cliente" description="Registra al cliente y selecciónalo para esta venta." submitLabel="Crear y seleccionar" onClose={onClose} onChange={setForm} onLookupDocument={() => void handleLookupDocument()} onSubmit={() => void handleSubmit()} onReset={() => setForm(getInitialForm(initialQuery))} />;
}
