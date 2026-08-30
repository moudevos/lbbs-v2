"use client";

import { faBars } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { usePathname } from "next/navigation";

import { UserMenu } from "@/components/layout/UserMenu";

type HeaderProps = {
  onOpenMobileSidebar: () => void;
};

const moduleTitles: Record<string, string> = {
  "/control": "Control",
  "/control/sedes": "Sedes",
  "/control/equipo": "Equipo",
  "/control/caja": "Caja",
  "/control/pos": "POS",
  "/control/rewards": "Rewards",
  "/control/ventas": "Ventas",
  "/control/configuracion": "Configuracion",
  "/control/produccion": "Produccion",
  "/control/liquidaciones": "Liquidaciones",
  "/control/servicios": "Servicios",
  "/control/productos": "Productos",
  "/control/clientes": "Clientes",
  "/control/reservas": "Reservas",
  "/control/mi-cuenta": "Mi cuenta",
  "/control/deudas-empleados": "Deudas de empleados",
  "/control/dispositivos": "Dispositivos",
  "/control/hotspots": "Hotspots",
  "/control/finanzas": "Finanzas",
  "/control/analisis-financiero": "Análisis financiero",
};

export function Header({ onOpenMobileSidebar }: HeaderProps) {
  const pathname = usePathname();
  const moduleTitle = moduleTitles[pathname] ?? "Control";

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-stone-200 bg-white/90 px-4 backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobileSidebar}
          className="inline-flex items-center justify-center rounded-xl border border-stone-200 bg-white p-2 text-stone-500 transition hover:border-amber-300 hover:text-amber-700 md:hidden"
          aria-label="Abrir menu lateral"
        >
          <FontAwesomeIcon icon={faBars} />
        </button>

        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.2em] text-stone-400">
            Modulo activo
          </p>
          <h1 className="truncate text-base font-semibold text-stone-900">
            {moduleTitle}
          </h1>
        </div>
      </div>

      <UserMenu />
    </header>
  );
}
