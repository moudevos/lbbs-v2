"use client";

import { Modal } from "@/components/ui/Modal";
import { CustomerForm } from "@/features/customers/customer-form";
import type { CustomerFormValue } from "@/features/customers/customer-types";
import { useModalDirtyState } from "@/lib/hooks/use-modal-dirty-state";

type CustomerFormModalProps = {
  open: boolean;
  value: CustomerFormValue;
  isSaving: boolean;
  isLookingUpDocument: boolean;
  isEditing: boolean;
  title?: string;
  description?: string;
  submitLabel?: string;
  size?: "sm" | "md" | "lg" | "xl";
  onClose: () => void;
  onChange: (next: CustomerFormValue) => void;
  onLookupDocument: () => void;
  onSubmit: () => void;
  onReset: () => void;
};

export function CustomerFormModal({
  open,
  value,
  isSaving,
  isLookingUpDocument,
  isEditing,
  title,
  description,
  submitLabel,
  size = "lg",
  onClose,
  onChange,
  onLookupDocument,
  onSubmit,
  onReset,
}: CustomerFormModalProps) {
  const isDirty = useModalDirtyState(open, value);

  return (
    <Modal
      open={open}
      title={title ?? (isEditing ? "Editar cliente" : "Nuevo cliente")}
      description={description ?? "Registra o actualiza la informacion principal del cliente."}
      onClose={() => {
        if (!isSaving) {
          onClose();
        }
      }}
      isDirty={isDirty}
      size={size}
    >
      <CustomerForm
        value={value}
        isSaving={isSaving}
        isLookingUpDocument={isLookingUpDocument}
        isEditing={isEditing}
        submitLabel={submitLabel}
        onChange={onChange}
        onLookupDocument={onLookupDocument}
        onSubmit={onSubmit}
        onReset={onReset}
      />
    </Modal>
  );
}
