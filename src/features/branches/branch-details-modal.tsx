// features/branches/branch-details-modal.tsx
"use client";

import { Modal } from "@/components/ui/Modal";
import { useEscapeKey } from "@/lib/hooks/use-escape-key";
import type { BranchRecord } from "@/features/branches/types";

interface BranchDetailsModalProps {
  open: boolean;
  branch: BranchRecord | null;
  onClose: () => void;
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-sm text-slate-800">{value?.trim() ? value : "—"}</p>
    </div>
  );
}

export function BranchDetailsModal({ open, branch, onClose }: BranchDetailsModalProps) {
  useEscapeKey(onClose, open);

  if (!branch) {
    return null;
  }

  return (
    <Modal
      open={open}
      title={branch.name}
      description="Detalles de la sede"
      onClose={onClose}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Código" value={branch.code} />
        <Field label="Slug" value={branch.slug} />
        <Field label="Nombre corto" value={branch.short_name} />
        <Field label="Ciudad" value={branch.city} />
        <Field label="Teléfono" value={branch.phone} />
        <Field label="Estado" value={branch.is_active ? "Activo" : "Inactivo"} />
        <div className="sm:col-span-2">
          <Field label="Dirección" value={branch.address} />
        </div>
        <div className="sm:col-span-2">
          <Field label="Notas" value={branch.notes} />
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Cerrar
        </button>
      </div>
    </Modal>
  );
}