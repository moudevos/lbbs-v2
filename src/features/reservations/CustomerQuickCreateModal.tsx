"use client";

import { CustomerFormModal } from "@/features/customers/CustomerFormModal";
import type { CustomerFormValue } from "@/features/customers/customer-types";

type CustomerQuickCreateModalProps = {
  open: boolean;
  value: CustomerFormValue;
  isSaving: boolean;
  isLookingUpDocument: boolean;
  onClose: () => void;
  onChange: (next: CustomerFormValue) => void;
  onLookupDocument: () => void;
  onSubmit: () => void;
  onReset: () => void;
};

export function CustomerQuickCreateModal({
  open,
  value,
  isSaving,
  isLookingUpDocument,
  onClose,
  onChange,
  onLookupDocument,
  onSubmit,
  onReset,
}: CustomerQuickCreateModalProps) {
  return (
    <CustomerFormModal
      open={open}
      value={value}
      isSaving={isSaving}
      isLookingUpDocument={isLookingUpDocument}
      isEditing={false}
      title="Nuevo cliente"
      description="Crea un cliente rapido y vuelve directo a la reserva."
      submitLabel="Guardar cliente"
      size="md"
      onClose={onClose}
      onChange={onChange}
      onLookupDocument={onLookupDocument}
      onSubmit={onSubmit}
      onReset={onReset}
    />
  );
}
