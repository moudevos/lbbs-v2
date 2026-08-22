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
  faUsers,
} from "@fortawesome/free-solid-svg-icons";

export type SettingsTabId =
  | "cat:service_categories"
  | "cat:product_categories"
  | "cat:payment_methods"
  | "cat:product_units"
  | "cat:courtesy_reasons"
  | "courtesy-rules"
  | "cat:stock_adjustment_reasons"
  | "comp:operational"
  | "comp:reward"
  | "comp:courtesy"
  | "comp:product_bonus"
  | "comp:supply_markup"
  | "rewards"
  | "whatsapp"
  | "internal-benefits";

export type SettingsNavTab = {
  id: SettingsTabId;
  label: string;
  description: string;
  icon: IconDefinition;
};

export const settingsTabs: SettingsNavTab[] = [
  { id: "cat:service_categories", label: "Servicios", description: "Ordena el catalogo de servicios para facilitar su busqueda y reporte.", icon: faScissors },
  { id: "cat:product_categories", label: "Productos", description: "Clasifica los productos del catalogo para POS, stock y reportes.", icon: faBoxOpen },
  { id: "cat:payment_methods", label: "Pagos", description: "Define los medios de cobro disponibles en nuevas ventas de POS.", icon: faCreditCard },
  { id: "cat:product_units", label: "Unidades", description: "Define unidades de medida para registrar productos e inventario de forma consistente.", icon: faRulerCombined },
  { id: "cat:courtesy_reasons", label: "Cortesias", description: "Registra los motivos que el equipo debe indicar al entregar una cortesia en POS.", icon: faHandHoldingHeart },
  { id: "courtesy-rules", label: "Reglas de cortesía", description: "Define productos y cantidades de cortesía permitidos por cada servicio pagado.", icon: faHandHoldingHeart },
  { id: "cat:stock_adjustment_reasons", label: "Stock", description: "Define motivos auditables para ajustes, mermas, reposiciones y transferencias de inventario.", icon: faBoxesStacked },
  { id: "comp:operational", label: "Aportes", description: "Configura el aporte operativo descontado de la produccion antes de calcular una liquidacion.", icon: faSackDollar },
  { id: "comp:reward", label: "Rewards", description: "Configura la comision fija del barbero por servicios cobrados con un reward. No crea rewards para clientes.", icon: faGift },
  { id: "comp:courtesy", label: "Com. cortesias", description: "Configura la comision fija del barbero por servicios otorgados como cortesia aprobada.", icon: faHeart },
  { id: "comp:product_bonus", label: "Bonos", description: "Configura bonos por productos y servicios, de forma individual o por categoria.", icon: faStar },
  { id: "comp:supply_markup", label: "Recargos", description: "Configura el recargo al entregar insumos del inventario a un empleado. No cambia precios de venta al cliente.", icon: faPercent },
  { id: "rewards", label: "Fidelizacion", description: "Consulta reglas y premios de clientes. La gestion completa se realiza en el modulo Rewards.", icon: faGift },
  { id: "whatsapp", label: "Plantillas", description: "Edita los mensajes base usados para recordar reservas y agradecer atenciones.", icon: faCommentDots },
  { id: "internal-benefits", label: "Beneficios internos", description: "Vincula clientes con empleados y configura beneficios, crédito y consumos internos de POS.", icon: faUsers },
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
            title={`${tab.label}: ${tab.description}`}
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
              "ml-2 max-w-[160px] overflow-hidden whitespace-nowrap text-sm font-semibold opacity-100 transition-colors",
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
