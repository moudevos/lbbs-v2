export type AppRole = "owner" | "admin" | "reception" | "barber" | "viewer";

export type AppModule =
  | "control"
  | "branches"
  | "employees"
  | "cash"
  | "pos"
  | "rewards"
  | "sales"
  | "settings"
  | "services"
  | "products"
  | "customers"
  | "contacts"
  | "reservations"
  | "production"
  | "settlements"
  | "finance"
  | "payment_simulations";

const roleModules: Record<AppRole, AppModule[]> = {
  owner: [
    "control",
    "branches",
    "employees",
    "cash",
    "pos",
    "rewards",
    "sales",
    "settings",
    "services",
    "products",
    "customers",
    "contacts",
    "reservations",
    "production",
    "settlements",
    "finance",
    "payment_simulations",
  ],
  admin: [
    "control",
    "branches",
    "employees",
    "cash",
    "pos",
    "rewards",
    "sales",
    "settings",
    "services",
    "products",
    "customers",
    "contacts",
    "reservations",
    "production",
    "settlements",
    "finance",
    "payment_simulations",
  ],
  reception: [
    "control",
    "cash",
    "pos",
    "rewards",
    "sales",
    "customers",
    "contacts",
    "reservations",
  ],
  barber: [
    "control",
    "reservations",
  ],
  viewer: [
    "control",
  ],
};

export const moduleRouteMap: Record<AppModule, string> = {
  control: "/control",
  branches: "/control/sedes",
  employees: "/control/equipo",
  cash: "/control/caja",
  pos: "/control/pos",
  rewards: "/control/rewards",
  sales: "/control/ventas",
  settings: "/control/configuracion",
  services: "/control/servicios",
  products: "/control/productos",
  customers: "/control/clientes",
  contacts: "/control/contactos",
  reservations: "/control/reservas",
  production: "/control/produccion",
  settlements: "/control/liquidaciones",
  finance: "/control/finanzas",
  payment_simulations: "/control/simulaciones-pago",
};

export function canAccessModule(role: AppRole, module: AppModule) {
  return roleModules[role].includes(module);
}

export function getVisibleModules(role: AppRole) {
  return roleModules[role];
}
