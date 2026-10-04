"use client";

import { faMinus, faPlus, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Select } from "@/components/ui/select";
import type { PosCartItem } from "@/features/pos/pos-types";
import type { PosEmployeeRecord } from "@/features/pos/pos-types";
import { formatMoney, getItemSubtotal } from "@/features/pos/pos-utils";

type PosCartItemProps = {
  item: PosCartItem;
  onDecrease: () => void;
  onIncrease: () => void;
  onRemove: () => void;
  onToggleCourtesy: () => void;
  courtesyAvailable: boolean;
  courtesyUnavailableReason: string;
  sellers: PosEmployeeRecord[];
  inheritedResponsibleEmployeeId: string | null;
  onResponsibleChange: (employeeId: string) => void;
};

export function PosCartItem({
  item,
  onDecrease,
  onIncrease,
  onRemove,
  onToggleCourtesy,
  courtesyAvailable,
  courtesyUnavailableReason,
  sellers,
  inheritedResponsibleEmployeeId,
  onResponsibleChange,
}: PosCartItemProps) {
  const inheritedSeller = sellers.find((seller) => seller.id === inheritedResponsibleEmployeeId);

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-sm font-medium text-slate-900">{item.name}</p>
            <span className="rounded border border-slate-200 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-slate-500">
              {item.item_type === "service" ? "Serv" : "Prod"}
            </span>
            {item.reservation_suggestion ? <span className="rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[9px] font-semibold text-sky-700">Sugerido por reserva</span> : null}
            {item.is_courtesy ? (
              <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-700">
                Cortesia
              </span>
            ) : null}
            {item.price_source === "employee" ? <span className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[9px] font-semibold text-violet-700">Empleado</span> : null}
            {item.visibility_scope === "internal" ? <span className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[9px] font-semibold text-violet-700">Solo personal</span> : null}
          </div>
          {item.category_name ? (
            <p className="text-[11px] text-slate-400">{item.category_name}</p>
          ) : null}
        </div>

        <button
          type="button"
          className="shrink-0 rounded p-1 text-rose-500 transition hover:bg-rose-50"
          onClick={onRemove}
        >
          <FontAwesomeIcon icon={faTrashCan} className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-md border border-slate-200">
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center text-slate-600 transition hover:text-slate-900"
            onClick={onDecrease}
          >
            <FontAwesomeIcon icon={faMinus} className="h-3 w-3" />
          </button>
          <span className="min-w-7 text-center text-xs font-semibold text-slate-900">
            {item.quantity}
          </span>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center text-slate-600 transition hover:text-slate-900"
            onClick={onIncrease}
          >
            <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
          </button>
        </div>

        <span className="text-xs text-slate-400">{formatMoney(item.unit_price)}{item.price_source === "employee" && item.retail_price !== undefined ? ` · Regular ${formatMoney(item.retail_price)}` : ""}</span>
        <span className="ml-auto text-sm font-semibold text-slate-900">
          {formatMoney(getItemSubtotal(item))}
        </span>
      </div>

      {item.item_type === "product" ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-500" title={!item.is_courtesy && !courtesyAvailable ? courtesyUnavailableReason : undefined}>
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              checked={item.is_courtesy}
              onChange={onToggleCourtesy}
              disabled={!item.is_courtesy && !courtesyAvailable}
            />
            Cortesia {!item.is_courtesy && !courtesyAvailable ? `(${courtesyUnavailableReason})` : ""}
          </label>
          <label className="min-w-48 flex-1 text-[11px] text-slate-600">
            {inheritedSeller ? `Responsable: ${inheritedSeller.full_name} · heredado del servicio` : `Responsable${item.business_line === "barbershop_products" ? " *" : " (opcional)"}`}
            <Select value={item.responsible_employee_id ?? ""} onChange={(event) => onResponsibleChange(event.target.value)} className="mt-1 h-8 text-xs">
              <option value="">{inheritedSeller ? "Mantener responsable heredado" : item.business_line === "barbershop_products" ? "Seleccionar vendedor" : "Sin responsable"}</option>
              {sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.full_name} · {seller.role}</option>)}
            </Select>
          </label>
        </div>
      ) : null}

    </article>
  );
}
