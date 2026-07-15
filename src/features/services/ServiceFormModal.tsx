"use client";

import { Modal } from "@/components/ui/Modal";
import { ServiceForm } from "@/features/services/service-form";
import type { ServiceCategoryRecord, ServiceFormValue } from "@/features/services/service-types";
import { useModalDirtyState } from "@/lib/hooks/use-modal-dirty-state";

type ServiceFormModalProps = {
  open: boolean;
  value: ServiceFormValue;
  categories: ServiceCategoryRecord[];
  isSaving: boolean;
  isEditing: boolean;
  onClose: () => void;
  onChange: (next: ServiceFormValue) => void;
  onSubmit: () => void;
  onReset: () => void;
};

export function ServiceFormModal({
  open,
  value,
  categories,
  isSaving,
  isEditing,
  onClose,
  onChange,
  onSubmit,
  onReset,
}: ServiceFormModalProps) {
  const isDirty = useModalDirtyState(open, value);

  return (
    <Modal
      open={open}
      title={isEditing ? "Editar servicio" : "Nuevo servicio"}
      description="Gestiona la informacion base del servicio."
      onClose={() => {
        if (!isSaving) {
          onClose();
        }
      }}
      isDirty={isDirty}
      size="lg"
    >
      <ServiceForm
        value={value}
        categories={categories}
        isSaving={isSaving}
        isEditing={isEditing}
        onChange={onChange}
        onSubmit={onSubmit}
        onReset={onReset}
      />
    </Modal>
  );
}
