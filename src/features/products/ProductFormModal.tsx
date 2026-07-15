"use client";

import { Modal } from "@/components/ui/Modal";
import { ProductForm } from "@/features/products/product-form";
import type { ProductCategoryRecord, ProductFormValue } from "@/features/products/product-types";
import { useModalDirtyState } from "@/lib/hooks/use-modal-dirty-state";

type ProductFormModalProps = {
  open: boolean;
  value: ProductFormValue;
  categories: ProductCategoryRecord[];
  isSaving: boolean;
  isEditing: boolean;
  onClose: () => void;
  onChange: (next: ProductFormValue) => void;
  onSubmit: () => void;
  onReset: () => void;
};

export function ProductFormModal({
  open,
  value,
  categories,
  isSaving,
  isEditing,
  onClose,
  onChange,
  onSubmit,
  onReset,
}: ProductFormModalProps) {
  const isDirty = useModalDirtyState(open, value);

  return (
    <Modal
      open={open}
      title={isEditing ? "Editar producto" : "Nuevo producto"}
      description="Gestiona la informacion base del producto."
      onClose={() => {
        if (!isSaving) {
          onClose();
        }
      }}
      isDirty={isDirty}
      size="lg"
    >
      <ProductForm
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
