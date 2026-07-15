"use client";

import { formatMoney } from "@/features/pos/pos-utils";

type PosCatalogCardProps = {
  title: string;
  category: string | null;
  price: string;
  isInactive?: boolean;
  disabled?: boolean;
  onAdd: () => void;
};

export function PosCatalogCard({
  title,
  category,
  price,
  isInactive = false,
  disabled = false,
  onAdd,
}: PosCatalogCardProps) {
  return (
    <button
      type="button"
      className={[
        "flex h-[84px] w-full flex-col justify-between rounded-md border px-2 py-1.5 text-left transition",
        disabled || isInactive
          ? "cursor-not-allowed border-slate-200 bg-slate-100/70 opacity-60"
          : "border-slate-200 bg-white hover:border-sky-300 hover:bg-sky-50/60",
      ].join(" ")}
      disabled={disabled}
      onClick={onAdd}
    >
      <div className="min-w-0">
        <p className="line-clamp-2 text-xs font-semibold leading-tight text-slate-900">{title}</p>
        {category ? (
          <p className="mt-0.5 truncate text-[10px] text-slate-400">{category}</p>
        ) : null}
      </div>

      <div className="flex items-end justify-between gap-1">
        <span className="text-xs font-bold text-emerald-700">{formatMoney(price)}</span>
        {isInactive ? (
          <span className="text-[9px] font-medium text-amber-700">Inactivo</span>
        ) : null}
      </div>
    </button>
  );
}