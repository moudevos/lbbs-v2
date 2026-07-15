"use client";

import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/button";
import type { PosCustomerRecord } from "@/features/pos/pos-types";

type PosCustomerModalProps = {
  open: boolean;
  customerVariousId: string | null;
  onClose: () => void;
  onSelect: (customer: PosCustomerRecord) => void;
  onSearch: (query: string) => Promise<PosCustomerRecord[]>;
};

export function PosCustomerModal({
  open,
  customerVariousId,
  onClose,
  onSelect,
  onSearch,
}: PosCustomerModalProps) {
  return (
    <Modal
      open={open}
      title="Seleccionar cliente"
      description="Busca por nombre, celular o documento."
      onClose={onClose}
      size="md"
    >
      {/* Solo se monta mientras el modal está abierto: cada apertura arranca con estado limpio */}
      {open ? (
        <PosCustomerModalBody
          customerVariousId={customerVariousId}
          onSelect={(customer) => {
            onSelect(customer);
            onClose();
          }}
          onSearch={onSearch}
        />
      ) : null}
    </Modal>
  );
}

type PosCustomerModalBodyProps = {
  customerVariousId: string | null;
  onSelect: (customer: PosCustomerRecord) => void;
  onSearch: (query: string) => Promise<PosCustomerRecord[]>;
};

function PosCustomerModalBody({
  customerVariousId,
  onSelect,
  onSearch,
}: PosCustomerModalBodyProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PosCustomerRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const trimmed = query.trim();

    if (!trimmed) {
      return;
    }

    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      try {
        const nextResults = await onSearch(trimmed);
        setResults(nextResults);
        setHighlightedIndex(-1);
      } finally {
        setIsLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [onSearch, query]);

  const visibleResults = query.trim() ? results : [];

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && visibleResults.length > 0) {
      event.preventDefault();
      setHighlightedIndex((current) => Math.min(current + 1, visibleResults.length - 1));
      return;
    }

    if (event.key === "ArrowUp" && visibleResults.length > 0) {
      event.preventDefault();
      setHighlightedIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const customer =
        highlightedIndex >= 0
          ? visibleResults[highlightedIndex]
          : visibleResults.length === 1
            ? visibleResults[0]
            : null;
      if (customer) onSelect(customer);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Buscar cliente"
          className="h-10"
          autoFocus
        />

        {customerVariousId ? (
          <Button
            type="button"
            className="h-10 shrink-0 bg-slate-100 px-3 text-slate-700 hover:bg-slate-200"
            onClick={() =>
              onSelect({
                id: customerVariousId,
                full_name: "Cliente varios",
                phone: "000000000",
                document_number: null,
                is_active: true,
              })
            }
          >
            Varios
          </Button>
        ) : null}
      </div>

      <div className="max-h-80 space-y-2 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2">
        {!query.trim() ? (
          <p className="px-2 py-4 text-center text-sm text-slate-500">
            Escribe para buscar un cliente.
          </p>
        ) : isLoading ? (
          <p className="px-2 py-4 text-center text-sm text-slate-500">Buscando clientes...</p>
        ) : visibleResults.length > 0 ? (
          visibleResults.map((customer, index) => (
            <button
              key={customer.id}
              type="button"
              className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition hover:border-sky-200 hover:bg-sky-50 ${
                highlightedIndex === index
                  ? "border-sky-300 bg-sky-50"
                  : "border-slate-200"
              }`}
              onClick={() => onSelect(customer)}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">
                  {customer.full_name}
                </p>
                <p className="text-xs text-slate-500">
                  {customer.phone}
                  {customer.document_number ? ` · ${customer.document_number}` : ""}
                </p>
              </div>
              <span className="text-xs font-semibold text-sky-700">Seleccionar</span>
            </button>
          ))
        ) : (
          <p className="px-2 py-4 text-center text-sm text-slate-500">
            No se encontraron clientes.
          </p>
        )}
      </div>
    </div>
  );
}
