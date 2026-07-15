"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import {
  faBoxesStacked,
  faBoxOpen,
  faCommentDots,
  faCreditCard,
  faGift,
  faHandHoldingHeart,
  faHeart,
  faPercent,
  faRulerCombined,
  faSackDollar,
  faScissors,
  faStar,
} from "@fortawesome/free-solid-svg-icons";

export type SettingsTabId =
  | "cat:service_categories"
  | "cat:product_categories"
  | "cat:payment_methods"
  | "cat:product_units"
  | "cat:courtesy_reasons"
  | "cat:stock_adjustment_reasons"
  | "comp:operational"
  | "comp:reward"
  | "comp:courtesy"
  | "comp:product_bonus"
  | "comp:supply_markup"
  | "whatsapp";

type NavTab = { id: SettingsTabId; label: string; icon: IconDefinition };

export const settingsTabs: NavTab[] = [
  { id: "cat:service_categories", label: "Servicios", icon: faScissors },
  { id: "cat:product_categories", label: "Productos", icon: faBoxOpen },
  { id: "cat:payment_methods", label: "Pagos", icon: faCreditCard },
  { id: "cat:product_units", label: "Unidades", icon: faRulerCombined },
  { id: "cat:courtesy_reasons", label: "Cortesias", icon: faHandHoldingHeart },
  { id: "cat:stock_adjustment_reasons", label: "Stock", icon: faBoxesStacked },
  { id: "comp:operational", label: "Aportes", icon: faSackDollar },
  { id: "comp:reward", label: "Rewards", icon: faGift },
  { id: "comp:courtesy", label: "Com. cortesias", icon: faHeart },
  { id: "comp:product_bonus", label: "Bonos", icon: faStar },
  { id: "comp:supply_markup", label: "Recargos", icon: faPercent },
  { id: "whatsapp", label: "Plantillas", icon: faCommentDots },
];

type SettingsUnifiedNavProps = {
  active: SettingsTabId;
  onChange: (id: SettingsTabId) => void;
};

export function SettingsUnifiedNav({ active, onChange }: SettingsUnifiedNavProps) {
  return (
    <nav className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-3">
      {settingsTabs.map((tab) => {
        const isActive = tab.id === active;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            title={tab.label}
            className={[
              "group flex items-center rounded-full py-2 pl-2.5 transition-colors duration-200",
              isActive ? "bg-emerald-50 pr-3.5" : "pr-2.5 hover:bg-slate-100",
            ].join(" ")}
          >
            <FontAwesomeIcon
              icon={tab.icon}
              className={[
                "h-4 w-4 shrink-0 transition-colors",
                isActive ? "text-emerald-600" : "text-slate-400 group-hover:text-slate-600",
              ].join(" ")}
            />

            <span
              className={[
                "overflow-hidden whitespace-nowrap text-sm font-semibold transition-all duration-300 ease-out",
                isActive ? "ml-2 max-w-[160px] opacity-100" : "ml-0 max-w-0 opacity-0",
                isActive ? "text-emerald-700" : "text-slate-600",
              ].join(" ")}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}