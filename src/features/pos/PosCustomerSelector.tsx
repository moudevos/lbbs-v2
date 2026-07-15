"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { PosCustomerModal } from "@/features/pos/PosCustomerModal";
import type { PosCustomerRecord } from "@/features/pos/pos-types";

type PosCustomerSelectorProps = {
  value: PosCustomerRecord | null;
  customerVariousId: string | null;
  onChange: (customer: PosCustomerRecord) => void;
  onSearch: (query: string) => Promise<PosCustomerRecord[]>;
};

export function PosCustomerSelector({
  value,
  customerVariousId,
  onChange,
  onSearch,
}: PosCustomerSelectorProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const isVariousCustomer = useMemo(
    () => value?.id === customerVariousId,
    [customerVariousId, value?.id],
  );

  return (
    <div className="space-y-2 border-b border-slate-200 pb-3">
      {value ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold text-slate-900">{value.full_name}</p>
              {isVariousCustomer ? (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                  Cliente varios
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {value.phone}
              {value.document_number ? ` · ${value.document_number}` : ""}
            </p>
          </div>

          <Button
            type="button"
            className="h-8 bg-slate-100 px-3 text-xs text-slate-700 hover:bg-slate-200"
            onClick={() => setIsModalOpen(true)}
          >
            Cambiar
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          className="h-10 w-full justify-center bg-slate-100 text-slate-700 hover:bg-slate-200"
          onClick={() => setIsModalOpen(true)}
        >
          Seleccionar cliente
        </Button>
      )}

      <PosCustomerModal
        open={isModalOpen}
        customerVariousId={customerVariousId}
        onClose={() => setIsModalOpen(false)}
        onSelect={onChange}
        onSearch={onSearch}
      />
    </div>
  );
}