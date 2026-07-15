"use client";

import { Modal } from "@/components/ui/Modal";
import { BranchForm } from "@/features/branches/branch-form";
import type { BranchFormValue } from "@/features/branches/types";
import { useModalDirtyState } from "@/lib/hooks/use-modal-dirty-state";

type BranchFormModalProps = {
  open: boolean;
  value: BranchFormValue;
  isSaving: boolean;
  isEditing: boolean;
  onClose: () => void;
  onChange: (next: BranchFormValue) => void;
  onSubmit: () => void;
  onReset: () => void;
};

export function BranchFormModal({
  open,
  value,
  isSaving,
  isEditing,
  onClose,
  onChange,
  onSubmit,
  onReset,
}: BranchFormModalProps) {
  const isDirty = useModalDirtyState(open, value);

  return (
    <Modal
      open={open}
      title={isEditing ? "Editar sede" : "Nueva sede"}
      description="Completa la informacion base de la sede."
      onClose={() => {
        if (!isSaving) {
          onClose();
        }
      }}
      isDirty={isDirty}
      size="md"
    >
      <BranchForm
        value={value}
        isSaving={isSaving}
        isEditing={isEditing}
        onChange={onChange}
        onSubmit={onSubmit}
        onReset={onReset}
      />
    </Modal>
  );
}
