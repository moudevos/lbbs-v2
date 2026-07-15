"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/textarea";
import type { CustomerRecord } from "@/features/customers/customer-types";
import { searchRewardCustomers } from "@/features/rewards/rewards-actions";

type RewardMigrationModalProps = {
  open: boolean;
  isSaving: boolean;
  initialCustomer?: CustomerRecord | null;
  onClose: () => void;
  onSubmit: (payload: {
    customer: CustomerRecord;
    stickers: string;
    note: string;
  }) => void;
};

function getCustomerLabel(customer: CustomerRecord) {
  return customer.business_name || customer.full_name;
}

export function RewardMigrationModal({
  open,
  isSaving,
  initialCustomer = null,
  onClose,
  onSubmit,
}: RewardMigrationModalProps) {
  const [query, setQuery] = useState(initialCustomer ? getCustomerLabel(initialCustomer) : "");
  const [results, setResults] = useState<CustomerRecord[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(initialCustomer);
  const [stickers, setStickers] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open || initialCustomer || !query.trim()) {
      return;
    }

    const timer = window.setTimeout(async () => {
      setIsSearching(true);
      try {
        const nextResults = await searchRewardCustomers(query);
        setResults(nextResults);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [initialCustomer, open, query]);

  function handleClose() {
    setQuery("");
    setResults([]);
    setSelectedCustomer(null);
    setStickers("");
    setNote("");
    onClose();
  }

  const isDirty = useMemo(
    () => Boolean(stickers || note || (!initialCustomer && (query || selectedCustomer))),
    [initialCustomer, note, query, selectedCustomer, stickers],
  );

  const visibleResults = query.trim() ? results : [];
  const isCustomerLocked = Boolean(initialCustomer);

  return (
    <Modal
      open={open}
      title="Migrar tarjeta"
      description="Registra stickers de tarjetas fisicas como atenciones generales auditadas."
      onClose={handleClose}
      isDirty={isDirty}
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button
            className="bg-slate-100 text-slate-700 hover:bg-slate-200"
            onClick={handleClose}
          >
            Cancelar
          </Button>
          <Button
            onClick={() => {
              if (!selectedCustomer) {
                return;
              }

              onSubmit({
                customer: selectedCustomer,
                stickers,
                note,
              });
            }}
            disabled={!selectedCustomer || isSaving}
          >
            {isSaving ? "Registrando..." : "Guardar migracion"}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {!isCustomerLocked ? (
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre, celular o documento"
          />
        ) : null}

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          {selectedCustomer ? (
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <p className="text-sm font-semibold text-slate-900">
                {getCustomerLabel(selectedCustomer)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {selectedCustomer.document_number || "Sin documento"}
                {" - "}
                {selectedCustomer.phone || "Sin celular"}
              </p>
            </div>
          ) : isSearching ? (
            <p className="text-sm text-slate-500">Buscando clientes...</p>
          ) : visibleResults.length > 0 ? (
            <div className="space-y-2">
              {visibleResults.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-sky-200 hover:bg-sky-50"
                  onClick={() => {
                    setSelectedCustomer(customer);
                    setQuery(getCustomerLabel(customer));
                    setResults([]);
                  }}
                >
                  <p className="text-sm font-semibold text-slate-900">
                    {getCustomerLabel(customer)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {customer.document_number || "Sin documento"}
                    {" - "}
                    {customer.phone || "Sin celular"}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              {query.trim() ? "No se encontraron clientes." : "Escribe para buscar un cliente."}
            </p>
          )}
        </div>

        <Input
          value={stickers}
          onChange={(event) => setStickers(event.target.value)}
          placeholder="Cantidad de stickers o atenciones acumuladas"
          type="number"
          min="0"
          step="1"
        />
        <Textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Motivo o nota obligatoria"
        />
      </div>
    </Modal>
  );
}
