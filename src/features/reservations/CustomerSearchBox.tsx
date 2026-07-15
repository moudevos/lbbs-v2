"use client";

import { faMagnifyingGlass, faPlus, faRotateLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEscapeKey } from "@/lib/hooks/use-escape-key";
import type { ReservationCustomerOption } from "@/features/reservations/reservation-types";

type CustomerSearchBoxProps = {
  selectedCustomer: ReservationCustomerOption | null;
  onSelect: (customer: ReservationCustomerOption | null) => void;
  onRequestCreate: (prefillName?: string) => void;
};

function customerSubtitle(customer: ReservationCustomerOption) {
  const parts = [customer.document_number, customer.phone].filter(Boolean);
  return parts.join(" · ");
}

export function CustomerSearchBox({ selectedCustomer, onSelect, onRequestCreate }: CustomerSearchBoxProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ReservationCustomerOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const normalized = query.trim();
    if (!normalized) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsLoading(true);

      try {
        const response = await fetch(
          `/api/admin/customers/search?q=${encodeURIComponent(normalized)}&limit=8`,
          { cache: "no-store", signal: controller.signal },
        );
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || "No se pudieron buscar clientes.");
        }

        setResults(payload.data ?? []);
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }

        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  useEscapeKey(() => setIsOpen(false), isOpen);

  if (selectedCustomer) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">{selectedCustomer.full_name}</p>
            <p className="mt-1 text-sm text-slate-600">{customerSubtitle(selectedCustomer)}</p>
          </div>
          <Button
            type="button"
            className="bg-slate-100 text-slate-700 hover:bg-slate-200"
            onClick={() => {
              setQuery("");
              setResults([]);
              onSelect(null);
            }}
          >
            <FontAwesomeIcon icon={faRotateLeft} />
            Cambiar
          </Button>
        </div>
      </div>
    );
  }

  const trimmedQuery = query.trim();
  const showEmptyState = trimmedQuery.length > 0 && !isLoading && results.length === 0;
  const showInfo = !trimmedQuery || isLoading;

  return (
    <div ref={containerRef} className="relative w-full">
      <label className="space-y-2">
        <span className="text-sm font-medium text-slate-700">Cliente</span>
        <div className="relative">
          <Input
            value={query}
            onChange={(event) => {
              const nextValue = event.target.value;
              setQuery(nextValue);
              if (!nextValue.trim()) {
                setResults([]);
              }
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            placeholder="Buscar por nombre, celular o documento"
            className="pr-10"
          />
          <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400">
            <FontAwesomeIcon icon={faMagnifyingGlass} />
          </span>
        </div>
      </label>

      {isOpen ? (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-lg">
          {results.length > 0 ? (
            results.map((customer) => (
              <button
                key={customer.id}
                type="button"
                className="flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-sky-50"
                onClick={() => {
                  onSelect(customer);
                  setIsOpen(false);
                }}
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">{customer.full_name}</p>
                  <p className="mt-1 text-xs text-slate-500">{customerSubtitle(customer)}</p>
                </div>
                <span
                  className={[
                    "rounded-full px-2 py-1 text-[11px] font-semibold",
                    customer.is_active
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-600",
                  ].join(" ")}
                >
                  {customer.is_active ? "Activo" : "Inactivo"}
                </span>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-slate-500">
              {showInfo ? "Escribe para buscar por nombre, celular o documento." : "No se encontraron coincidencias."}
            </div>
          )}

          {showEmptyState ? (
            <button
              type="button"
              className="mt-1 flex w-full items-center gap-2 rounded-xl border border-dashed border-sky-200 bg-sky-50/40 px-3 py-2 text-left text-sm font-medium text-sky-700 transition hover:bg-sky-50"
              onClick={() => {
                onRequestCreate(trimmedQuery);
                setIsOpen(false);
              }}
            >
              <FontAwesomeIcon icon={faPlus} />
              Agregar cliente &ldquo;{trimmedQuery}&rdquo;
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
