"use client";

import type { PosCatalogTab } from "@/features/pos/pos-types";
import { cn } from "@/lib/utils/cn";

type PosCatalogTabsProps = {
  value: PosCatalogTab;
  onChange: (next: PosCatalogTab) => void;
};

export function PosCatalogTabs({ value, onChange }: PosCatalogTabsProps) {
  return (
    <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
      {[
        { value: "all", label: "Todo" },
        { value: "services", label: "Servicios" },
        { value: "products", label: "Productos" },
      ].map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value as PosCatalogTab)}
          className={cn(
            "rounded-lg px-4 py-2 text-sm font-medium transition",
            value === tab.value
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-800",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
