"use client";

import Image from "next/image";
import {
  faBoxOpen,
  faCashRegister,
  faBuilding,
  faCalendarDays,
  faComments,
  faChevronLeft,
  faChevronRight,
  faFileInvoiceDollar,
  faGear,
  faGift,
  faHouse,
  faPeopleGroup,
  faChartLine,
  faMoneyCheckDollar,
  faCalculator,
  faHandHoldingDollar,
  faMobileScreenButton,
  faScissors,
  faUsers,
  faWifi,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import { SidebarItem } from "@/components/layout/SidebarItem";
import { canAccessModule, type AppModule, type AppRole } from "@/lib/auth/module-permissions";
import { cn } from "@/lib/utils/cn";

type SidebarProps = {
  role: AppRole;
  isCollapsed: boolean;
  isMobileOpen: boolean;
  onToggleCollapse: () => void;
  onCloseMobile: () => void;
};

const items = [
  { href: "/control", label: "Control", icon: faHouse, module: "control" },
  { href: "/control/sedes", label: "Sedes", icon: faBuilding, module: "branches" },
  { href: "/control/equipo", label: "Equipo", icon: faPeopleGroup, module: "employees" },
  { href: "/control/caja", label: "Caja", icon: faCashRegister, module: "cash" },
  { href: "/control/pos", label: "POS", icon: faCashRegister, module: "pos" },
  { href: "/control/rewards", label: "Rewards", icon: faGift, module: "rewards" },
  { href: "/control/ventas", label: "Ventas", icon: faFileInvoiceDollar, module: "sales" },
  { href: "/control/configuracion", label: "Configuracion", icon: faGear, module: "settings" },
  { href: "/control/servicios", label: "Servicios", icon: faScissors, module: "services" },
  { href: "/control/productos", label: "Productos", icon: faBoxOpen, module: "products" },
  { href: "/control/clientes", label: "Clientes", icon: faUsers, module: "customers" },
  { href: "/control/contactos", label: "Contactos", icon: faComments, module: "contacts" },
  { href: "/control/reservas", label: "Reservas", icon: faCalendarDays, module: "reservations" },
  { href: "/control/produccion", label: "Produccion", icon: faChartLine, module: "production" },
  { href: "/control/liquidaciones", label: "Liquidaciones", icon: faMoneyCheckDollar, module: "settlements" },
  { href: "/control/simulaciones-pago", label: "Simulaciones", icon: faCalculator, module: "payment_simulations" },
  { href: "/control/finanzas", label: "Finanzas", icon: faMoneyCheckDollar, module: "finance" },
  { href: "/control/deudas-empleados", label: "Deudas de empleados", icon: faHandHoldingDollar, module: "employee_debts" },
  { href: "/control/dispositivos", label: "Dispositivos", icon: faMobileScreenButton, module: "devices" },
  { href: "/control/hotspots", label: "Hotspots", icon: faWifi, module: "hotspots" },
] satisfies Array<{
  href: string;
  label: string;
  icon: typeof faHouse;
  module: AppModule;
}>;

type SidebarGroup = {
  id: string;
  label: string;
  modules: AppModule[];
};

const groups: SidebarGroup[] = [
  { id: "principal", label: "Principal", modules: ["control"] },
  { id: "operacion", label: "Operacion", modules: ["pos", "sales", "cash", "reservations"] },
  { id: "clientes", label: "Clientes", modules: ["customers", "contacts", "rewards"] },
  { id: "catalogo", label: "Catalogo", modules: ["services", "products"] },
  { id: "personal", label: "Personal", modules: ["production", "settlements", "payment_simulations", "employee_debts"] },
  {
    id: "administracion",
    label: "Administracion",
    modules: ["branches", "employees", "settings", "finance", "devices", "hotspots"],
  },
];

function isRouteActive(pathname: string, href: string) {
  if (href === "/control") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

// Fondo decorativo de puntos, un solo lugar, se desvanece hacia abajo
function DotGlow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 overflow-hidden"
      style={{
        backgroundImage:
          "radial-gradient(circle, rgba(251,191,36,0.35) 1.5px, transparent 1.5px)",
        backgroundSize: "8px 8px",
        maskImage: "linear-gradient(to bottom, transparent, black)",
        WebkitMaskImage: "linear-gradient(to bottom, transparent, black)",
      }}
    />
  );
}

export function Sidebar({
  role,
  isCollapsed,
  isMobileOpen,
  onToggleCollapse,
  onCloseMobile,
}: SidebarProps) {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const visibleItems = useMemo(
    () => items.filter((item) => canAccessModule(role, item.module)),
    [role],
  );
  const visibleGroups = useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          items: visibleItems.filter((item) => group.modules.includes(item.module)),
        }))
        .filter((group) => group.items.length > 0),
    [visibleItems],
  );
  const activeGroupId = visibleGroups.find((group) => group.items.some((item) => isRouteActive(pathname, item.href)))?.id ?? null;
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = window.sessionStorage.getItem("lbbs-sidebar-group");
      if (stored) setOpenGroupId(stored);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function toggleGroup(groupId: string) {
    if (groupId === activeGroupId) return;
    setOpenGroupId((current) => {
      const next = current === groupId ? null : groupId;
      if (next) window.sessionStorage.setItem("lbbs-sidebar-group", next);
      else window.sessionStorage.removeItem("lbbs-sidebar-group");
      return next;
    });
  }

  return (
    <>
      {isMobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-slate-950/40 md:hidden"
          aria-label="Cerrar menu lateral"
          onClick={onCloseMobile}
        />
      ) : null}

      {/* Desktop */}
      <aside
        className={[
          "sticky top-0 z-30 hidden h-screen shrink-0 flex-col overflow-hidden bg-slate-900 transition-[width] duration-300 md:flex",
          isCollapsed ? "w-20" : "w-64",
        ].join(" ")}
      >
        <div className="relative">
          <div
            className={cn(
              "relative flex items-center border-b border-slate-800 px-4",
              isCollapsed ? "flex-col gap-3 py-4" : "h-16 justify-between",
            )}
          >
            <div
              className={cn(
                "flex items-center gap-3",
                isCollapsed ? "flex-col" : "min-w-0",
              )}
            >
              <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-xl border border-white/40 bg-white shadow-sm">
                <Image
                  src="/branch/logobgg.png"
                  alt="La Bajadita Barber Studio"
                  fill
                  sizes="36px"
                  className="object-contain p-1"
                  priority
                />
              </div>
              {!isCollapsed ? (
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">LA BAJADITA</p>
                  <p className="truncate text-xs text-slate-400">Panel de control</p>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800/70 text-slate-300 transition hover:bg-slate-800 hover:text-white active:scale-95"
              onClick={onToggleCollapse}
              aria-label={isCollapsed ? "Expandir sidebar" : "Plegar sidebar"}
            >
              <FontAwesomeIcon
                icon={isCollapsed ? faChevronRight : faChevronLeft}
                className="h-3.5 w-3.5"
              />
            </button>
          </div>
        </div>
        <DotGlow />
        <nav className="flex-1 space-y-3 overflow-y-auto p-3">
          {isCollapsed
            ? visibleItems.map((item) => (
                <SidebarItem
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  active={isRouteActive(pathname, item.href)}
                  collapsed
                  pending={pendingHref === item.href && !isRouteActive(pathname, item.href)}
                  onNavigate={() => setPendingHref(item.href)}
                />
              ))
            : visibleGroups.map((group) => {
                const hasActiveItem = group.items.some((item) => isRouteActive(pathname, item.href));
                const isOpen = hasActiveItem || openGroupId === group.id;

                return (
                  <section key={group.id} className="space-y-2">
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.id)}
                      className="flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 transition hover:bg-slate-800/60 hover:text-slate-200"
                    >
                      <span>{group.label}</span>
                      <FontAwesomeIcon
                        icon={isOpen ? faChevronLeft : faChevronRight}
                        className={cn("h-3 w-3 transition-transform", isOpen ? "-rotate-90" : "rotate-0")}
                      />
                    </button>

                    {isOpen ? (
                      <div className="space-y-1">
                        {group.items.map((item) => (
                          <SidebarItem
                            key={item.href}
                            href={item.href}
                            label={item.label}
                            icon={item.icon}
                            active={isRouteActive(pathname, item.href)}
                            collapsed={false}
                            pending={pendingHref === item.href && !isRouteActive(pathname, item.href)}
                            onNavigate={() => setPendingHref(item.href)}
                          />
                        ))}
                      </div>
                    ) : null}
                  </section>
                );
              })}
        </nav>
      </aside>

      {/* Mobile drawer */}
      <aside
        className={[
          "fixed inset-y-0 left-0 z-40 flex h-screen w-72 flex-col overflow-hidden bg-slate-900 shadow-2xl transition-transform duration-300 md:hidden",
          isMobileOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="relative">
          <div className="relative flex h-16 items-center justify-between border-b border-slate-800 px-4">
            <div className="flex items-center gap-3">
              <div className="relative h-9 w-9 overflow-hidden rounded-xl border border-white/40 bg-white shadow-sm">
                <Image
                  src="/branch/logobgg.png"
                  alt="La Bajadita Barber Studio"
                  fill
                  sizes="36px"
                  className="object-contain p-1"
                  priority
                />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">LA BAJADITA</p>
                <p className="truncate text-xs text-slate-400">Panel de control</p>
              </div>
            </div>

            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800/70 text-slate-300 transition hover:bg-slate-800 hover:text-white active:scale-95"
              aria-label="Cerrar menu lateral"
              onClick={onCloseMobile}
            >
              <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <DotGlow />
        <nav className="flex-1 space-y-3 overflow-y-auto p-3">
          {visibleGroups.map((group) => {
            const hasActiveItem = group.items.some((item) => isRouteActive(pathname, item.href));
            const isOpen = hasActiveItem || openGroupId === group.id;

            return (
              <section key={group.id} className="space-y-2">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className="flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 transition hover:bg-slate-800/60 hover:text-slate-200"
                >
                  <span>{group.label}</span>
                  <FontAwesomeIcon
                    icon={isOpen ? faChevronLeft : faChevronRight}
                    className={cn("h-3 w-3 transition-transform", isOpen ? "-rotate-90" : "rotate-0")}
                  />
                </button>

                {isOpen ? (
                  <div className="space-y-1">
                    {group.items.map((item) => (
                      <SidebarItem
                        key={item.href}
                        href={item.href}
                        label={item.label}
                        icon={item.icon}
                        active={isRouteActive(pathname, item.href)}
                        collapsed={false}
                        pending={pendingHref === item.href && !isRouteActive(pathname, item.href)}
                        onNavigate={() => { setPendingHref(item.href); onCloseMobile(); }}
                      />
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
