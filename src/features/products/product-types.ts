export type ProductCategoryRecord = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProductRecord = {
  id: string;
  category_id: string | null;
  sku: string | null;
  name: string;
  slug: string;
  description: string | null;
  barcode: string | null;
  unit: "unidad" | "paquete" | "botella" | "porcion" | "otro";
  cost_price: string;
  base_sale_price: string;
  branch_sale_price: string | null;
  final_sale_price: string;
  stock_quantity: string;
  allow_custom_price: boolean;
  is_stockable: boolean;
  is_courtesy_allowed: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  category_name: string | null;
  category_slug: string | null;
  selected_branch_id: string | null;
};

export type ProductFormValue = {
  category_id: string;
  sku: string;
  name: string;
  slug: string;
  description: string;
  barcode: string;
  unit: "unidad" | "paquete" | "botella" | "porcion" | "otro";
  cost_price: string;
  base_sale_price: string;
  allow_custom_price: boolean;
  is_stockable: boolean;
  is_courtesy_allowed: boolean;
  is_active: boolean;
};

export type ProductBranchPriceRecord = {
  id: string;
  product_id: string;
  branch_id: string;
  sale_price: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  branch_name: string | null;
  branch_slug: string | null;
  branch_code: string | null;
};

export type ProductBranchPriceFormValue = {
  id: string;
  product_id: string;
  branch_id: string;
  sale_price: string;
  is_active: boolean;
};

export type ProductStockSummary = {
  product_id: string;
  branch_id: string;
  branch_name: string;
  branch_slug: string;
  branch_code: string | null;
  stock_quantity: string;
  base_sale_price: string;
  branch_sale_price: string | null;
  final_sale_price: string;
  allow_custom_price: boolean;
  is_stockable: boolean;
  is_courtesy_allowed: boolean;
  is_active: boolean;
};

export type StockMovementRecord = {
  id: string;
  product_id: string;
  branch_id: string;
  branch_name: string | null;
  branch_slug: string | null;
  movement_type:
    | "purchase"
    | "sale"
    | "courtesy"
    | "adjustment"
    | "waste"
    | "transfer_in"
    | "transfer_out";
  quantity: string;
  signed_quantity: string;
  unit_cost: string | null;
  notes: string | null;
  created_at: string;
  created_by_name: string | null;
};

export type StockMovementFormValue = {
  product_id: string;
  branch_id: string;
  movement_type:
    | "purchase"
    | "sale"
    | "courtesy"
    | "adjustment"
    | "waste"
    | "transfer_in"
    | "transfer_out";
  quantity: string;
  unit_cost: string;
  notes: string;
};
