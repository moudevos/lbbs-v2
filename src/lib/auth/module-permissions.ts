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
  | "payment_simulations"
  | "devices"
  | "hotspots"
  | "employee_debts";

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
    "devices",
    "hotspots",
    "employee_debts",
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
    "devices",
    "hotspots",
    "employee_debts",
  ],
  reception: [
    "control",
    "cash",
    "pos",
    "rewards",
    "sales",
    "services",
    "customers",
    "products",
    "contacts",
    "reservations",
    "production",
    "employee_debts",
  ],
  barber: ["control", "reservations"],
  viewer: ["control"],
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
  devices: "/control/dispositivos",
  hotspots: "/control/hotspots",
  employee_debts: "/control/deudas-empleados",
};

export function canAccessModule(role: AppRole, module: AppModule) {
  return roleModules[role].includes(module);
}

export function getVisibleModules(role: AppRole) {
  return roleModules[role];
}
