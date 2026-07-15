export type ServiceCategoryRecord = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ServiceRecord = {
  id: string;
  category_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  base_price: string;
  duration_minutes: number;
  allow_custom_price: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  category_name: string | null;
  category_slug: string | null;
  branch_price: string | null;
  branch_price_is_active: boolean;
  final_price: string;
  price_mode: "base" | "custom";
  selected_branch_id: string | null;
};

export type ServiceFormValue = {
  category_id: string;
  name: string;
  slug: string;
  description: string;
  base_price: string;
  duration_minutes: string;
  allow_custom_price: boolean;
  is_active: boolean;
};

export type ServiceBranchPriceRecord = {
  id: string;
  service_id: string;
  branch_id: string;
  price: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  branch_name: string | null;
  branch_slug: string | null;
  branch_code: string | null;
};

export type ServiceBranchPriceFormValue = {
  id: string;
  service_id: string;
  branch_id: string;
  price: string;
  is_active: boolean;
};
