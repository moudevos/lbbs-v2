"use client";

import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SalesDetailModal } from "@/features/sales/SalesDetailModal";
import { PrintableSaleTicket } from "@/features/sales/PrintableSaleTicket";
import { Modal } from "@/components/ui/Modal";
import type { SaleDocumentPayload } from "@/lib/sales/sale-document-types";
import type {
  SaleDetailRecord,
  SalesHistoryFilters,
  SalesHistoryPayload,
} from "@/features/pos/pos-types";
import {
  formatMoney,
  getSaleStatusLabel,
} from "@/features/pos/pos-utils";

const initialFilters: SalesHistoryFilters = {
  dateFrom: "",
  dateTo: "",
  branchId: "",
  status: "",
  customer: "",
  barberId: "",
  paymentMethodId: "",
  posSessionId: "",
  itemType: "",
  courtesy: "",
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "Sin registro";
  }

  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Lima",
  }).format(new Date(value));
}

function buildQuery(filters: SalesHistoryFilters) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });

  return params.toString();
}

export function SalesPanel() {
  const [filters, setFilters] = useState<SalesHistoryFilters>(initialFilters);
  const [payload, setPayload] = useState<SalesHistoryPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [selectedSale, setSelectedSale] = useState<SaleDetailRecord | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [ticket, setTicket] = useState<SaleDocumentPayload | null>(null);

  async function loadData(nextFilters: SalesHistoryFilters) {
    setIsLoading(true);

    try {
      const query = buildQuery(nextFilters);
      const response = await fetch(`/api/admin/sales${query ? `?${query}` : ""}`, {
        cache: "no-store",
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "No se pudo cargar el historial de ventas.");
      }

      setPayload(result as SalesHistoryPayload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[sales/ui] Error al cargar ventas", { message });
      await Swal.fire({
        icon: "error",
        title: "No se pudo cargar el historial de ventas",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData(initialFilters);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const sales = payload?.data ?? [];
  const filterOptions = payload?.filters;

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter((value) => value).length,
    [filters],
  );

  async function handleApplyFilters() {
    await loadData(filters);
  }

  async function handleResetFilters() {
    setFilters(initialFilters);
    await loadData(initialFilters);
  }

  async function handleOpenDetail(saleId: string) {
    setIsDetailOpen(true);
    setIsLoadingDetail(true);

    try {
      const response = await fetch(`/api/admin/sales/${saleId}`, { cache: "no-store" });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "No se pudo cargar el detalle de la venta.");
      }

      setSelectedSale(result.data as SaleDetailRecord);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[sales/ui] Error al cargar detalle de venta", { message, saleId });
      await Swal.fire({
        icon: "error",
        title: "No se pudo cargar el detalle de la venta",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      setIsDetailOpen(false);
    } finally {
      setIsLoadingDetail(false);
    }
  }

  async function handleReprintTicket() {
    if (!selectedSale) return;
    try {
      const response = await fetch(`/api/admin/sales/${selectedSale.id}/ticket`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo cargar el ticket.");
      setTicket(result.data as SaleDocumentPayload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo cargar el ticket.";
      console.error("[sales/ui] Error al reimprimir ticket", { message, saleId: selectedSale.id });
      await Swal.fire({ icon: "error", title: "No se pudo cargar el ticket", text: message, confirmButtonColor: "#0f766e", background: "#ffffff", color: "#0f172a" });
    }
  }

  return (
    <>
      <section className="space-y-5">
        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Historial de ventas</p>
              <p className="mt-1 text-sm text-slate-600">
                Los filtros de fecha usan la jornada operativa de Lima.
              </p>
            </div>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
              Filtros activos: {activeFilterCount}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <Input
              type="date"
              value={filters.dateFrom}
              onChange={(event) =>
                setFilters((current) => ({ ...current, dateFrom: event.target.value }))
              }
            />
            <Input
              type="date"
              value={filters.dateTo}
              onChange={(event) =>
                setFilters((current) => ({ ...current, dateTo: event.target.value }))
              }
            />
            <Select
              value={filters.branchId}
              onChange={(event) =>
                setFilters((current) => ({ ...current, branchId: event.target.value }))
              }
            >
              <option value="">Todas las sedes</option>
              {filterOptions?.branches.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              value={filters.status}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  status: event.target.value as SalesHistoryFilters["status"],
                }))
              }
            >
              <option value="">Todos los estados</option>
              <option value="draft">Borrador</option>
              <option value="completed">Completada</option>
              <option value="cancelled">Anulada</option>
            </Select>
            <Input
              value={filters.customer}
              onChange={(event) =>
                setFilters((current) => ({ ...current, customer: event.target.value }))
              }
              placeholder="Buscar cliente"
            />
            <Select
              value={filters.barberId}
              onChange={(event) =>
                setFilters((current) => ({ ...current, barberId: event.target.value }))
              }
            >
              <option value="">Todos los barberos</option>
              {filterOptions?.barbers.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              value={filters.paymentMethodId}
              onChange={(event) =>
                setFilters((current) => ({ ...current, paymentMethodId: event.target.value }))
              }
            >
              <option value="">Todos los metodos</option>
              {filterOptions?.paymentMethods.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              value={filters.posSessionId}
              onChange={(event) =>
                setFilters((current) => ({ ...current, posSessionId: event.target.value }))
              }
            >
              <option value="">Todas las sesiones</option>
              {filterOptions?.sessions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              value={filters.itemType}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  itemType: event.target.value as SalesHistoryFilters["itemType"],
                }))
              }
            >
              <option value="">Todo item</option>
              <option value="service">Servicio</option>
              <option value="product">Producto</option>
            </Select>
            <Select
              value={filters.courtesy}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  courtesy: event.target.value as SalesHistoryFilters["courtesy"],
                }))
              }
            >
              <option value="">Todas las ventas</option>
              <option value="with_courtesy">Con cortesia</option>
              <option value="without_courtesy">Sin cortesia</option>
            </Select>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={() => void handleApplyFilters()} disabled={isLoading}>
              {isLoading ? "Cargando..." : "Aplicar filtros"}
            </Button>
            <Button
              type="button"
              className="bg-white text-slate-700 shadow-none hover:bg-slate-100"
              onClick={() => {
                void handleResetFilters();
              }}
              disabled={isLoading}
            >
              Limpiar
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Nº venta</th>
                  <th className="px-3 py-2.5 font-semibold">Fecha/hora (Lima)</th>
                  <th className="px-3 py-2.5 font-semibold">Cliente</th>
                  <th className="px-3 py-2.5 font-semibold">Sede</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Total</th>
                  <th className="px-3 py-2.5 font-semibold">Metodo</th>
                  <th className="px-3 py-2.5 font-semibold">Estado</th>
                  <th className="px-3 py-2.5 font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {!isLoading && sales.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-sm text-slate-500">
                      No hay ventas para los filtros seleccionados.
                    </td>
                  </tr>
                ) : null}

                {sales.map((sale) => (
                  <tr key={sale.id} className="transition hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-medium text-slate-900">{sale.saleReference}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">
                      {formatDateTime(sale.closedAt ?? sale.createdAt)}
                    </td>
                    <td className="max-w-[160px] truncate px-3 py-2.5 text-slate-700">
                      {sale.customerName}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{sale.branchName}</td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="font-semibold tabular-nums text-slate-900">
                        {formatMoney(sale.total)}
                      </div>
                      {sale.changeAmount > 0 ? (
                        <div className="text-[11px] font-medium text-amber-700">
                          Vuelto {formatMoney(sale.changeAmount)}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">
                      {sale.paymentMethodLabels.length > 0
                        ? sale.paymentMethodLabels.join(" · ")
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={[
                          "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                          sale.status === "completed"
                            ? "bg-emerald-50 text-emerald-700"
                            : sale.status === "cancelled"
                              ? "bg-rose-50 text-rose-700"
                              : "bg-amber-50 text-amber-700",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "h-1.5 w-1.5 rounded-full",
                            sale.status === "completed"
                              ? "bg-emerald-500"
                              : sale.status === "cancelled"
                                ? "bg-rose-500"
                                : "bg-amber-500",
                          ].join(" ")}
                        />
                        {getSaleStatusLabel(sale.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <Button
                        type="button"
                        className="h-8 border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm transition hover:border-amber-200 hover:bg-amber-50 hover:text-amber-800"
                        onClick={() => {
                          void handleOpenDetail(sale.id);
                        }}
                      >
                        Ver detalle
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <SalesDetailModal
        open={isDetailOpen}
        sale={selectedSale}
        isLoading={isLoadingDetail}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedSale(null);
        }}
        onReprint={() => { void handleReprintTicket(); }}
      />
      <Modal open={ticket !== null} title="Reimpresion de ticket" description="Snapshot operativo de la venta." onClose={() => setTicket(null)} confirmBeforeClose={false} size="md">
        {ticket ? <PrintableSaleTicket payload={ticket} onClose={() => setTicket(null)} /> : null}
      </Modal>
    </>
  );
}
