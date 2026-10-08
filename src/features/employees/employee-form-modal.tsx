"use client";

import { Modal } from "@/components/ui/Modal";
import { EmployeeForm } from "@/features/employees/employee-form";
import type { BranchRecord } from "@/features/branches/types";
import type { EmployeeCompensationTerm } from "@/features/employees/compensation";
import type { EmployeeFormValue } from "@/features/employees/types";
import { useModalDirtyState } from "@/lib/hooks/use-modal-dirty-state";

type EmployeeFormModalProps = {
  open: boolean;
  value: EmployeeFormValue;
  branches: BranchRecord[];
  isSaving: boolean;
  isEditing: boolean;
  currentCompensation: EmployeeCompensationTerm | null;
  onClose: () => void;
  onChange: (next: EmployeeFormValue) => void;
  onSubmit: () => void;
  onReset: () => void;
};

export function EmployeeFormModal({
  open,
  value,
  branches,
  isSaving,
  isEditing,
  currentCompensation,
  onClose,
  onChange,
  onSubmit,
  onReset,
}: EmployeeFormModalProps) {
  const isDirty = useModalDirtyState(open, value);

  return (
    <Modal
      open={open}
      title={isEditing ? "Editar empleado" : "Nuevo empleado"}
      description="Registra datos de perfil y acceso al sistema."
      onClose={() => {
        if (!isSaving) {
          onClose();
        }
      }}
      isDirty={isDirty}
      size="lg"
    >
      <EmployeeForm
        value={value}
        branches={branches}
        isSaving={isSaving}
        isEditing={isEditing}
        currentCompensation={currentCompensation}
        onChange={onChange}
        onSubmit={onSubmit}
        onReset={onReset}
      />
    </Modal>
  );
}
