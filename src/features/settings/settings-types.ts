export type SettingsSectionKey =
  | "service_categories"
  | "product_categories"
  | "payment_methods"
  | "product_units"
  | "courtesy_reasons"
  | "stock_adjustment_reasons";

export type SettingIdentityKey = "slug" | "code";

export type SettingMovementType =
  | "purchase"
  | "sale"
  | "courtesy"
  | "adjustment"
  | "waste"
  | "transfer_in"
  | "transfer_out";

export type SettingRecord = {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  slug?: string;
  code?: string;
  movement_type?: SettingMovementType | null;
  payment_kind?: PaymentKind;
  allows_change?: boolean;
  counts_as_cash?: boolean;
};

export type PaymentKind =
  | "cash"
  | "wallet_qr"
  | "card"
  | "bank_transfer"
  | "other_digital";

export type SettingFormValue = {
  name: string;
  identity: string;
  description: string;
  sort_order: string;
  is_active: boolean;
  movement_type: SettingMovementType | "";
  payment_kind: PaymentKind;
};

export type SettingsSectionConfig = {
  key: SettingsSectionKey;
  title: string;
  description: string;
  buttonLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  endpoint: string;
  identityKey: SettingIdentityKey;
  identityLabel: string;
  supportsMovementType?: boolean;
};

export const settingsSections: SettingsSectionConfig[] = [
  {
    key: "service_categories",
    title: "Servicios",
    description: "Categorias operativas usadas en el catalogo de servicios.",
    buttonLabel: "Nueva categoria",
    emptyTitle: "Sin categorias de servicios",
    emptyDescription: "Registra la primera categoria para ordenar el catalogo.",
    endpoint: "/api/admin/service-categories",
    identityKey: "slug",
    identityLabel: "Slug",
  },
  {
    key: "product_categories",
    title: "Productos",
    description: "Categorias operativas usadas en el catalogo de productos.",
    buttonLabel: "Nueva categoria",
    emptyTitle: "Sin categorias de productos",
    emptyDescription: "Registra la primera categoria para clasificar productos.",
    endpoint: "/api/admin/product-categories",
    identityKey: "slug",
    identityLabel: "Slug",
  },
  {
    key: "payment_methods",
    title: "Pagos",
    description: "Metodos disponibles para nuevas ventas en POS.",
    buttonLabel: "Nuevo metodo",
    emptyTitle: "Sin metodos de pago",
    emptyDescription: "Registra metodos para habilitarlos en POS.",
    endpoint: "/api/admin/payment-methods",
    identityKey: "code",
    identityLabel: "Codigo",
  },
  {
    key: "product_units",
    title: "Unidades",
    description: "Unidades operativas para futuros formularios de productos.",
    buttonLabel: "Nueva unidad",
    emptyTitle: "Sin unidades de producto",
    emptyDescription: "Registra unidades para mantener el catalogo operativo.",
    endpoint: "/api/admin/product-units",
    identityKey: "code",
    identityLabel: "Codigo",
  },
  {
    key: "courtesy_reasons",
    title: "Cortesias",
    description: "Motivos configurables para cortesias futuras en POS.",
    buttonLabel: "Nuevo motivo",
    emptyTitle: "Sin motivos de cortesia",
    emptyDescription: "Registra motivos para dejar lista la operacion futura.",
    endpoint: "/api/admin/courtesy-reasons",
    identityKey: "code",
    identityLabel: "Codigo",
  },
  {
    key: "stock_adjustment_reasons",
    title: "Stock",
    description: "Motivos de ajuste para movimientos operativos de inventario.",
    buttonLabel: "Nuevo motivo",
    emptyTitle: "Sin motivos de stock",
    emptyDescription: "Registra motivos para futuros formularios de ajustes.",
    endpoint: "/api/admin/stock-adjustment-reasons",
    identityKey: "code",
    identityLabel: "Codigo",
    supportsMovementType: true,
  },
];
