export type BranchRecord = {
  id: string;
  code: string | null;
  name: string;
  slug: string;
  short_name: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type BranchFormValue = {
  code: string;
  name: string;
  slug: string;
  short_name: string;
  city: string;
  address: string;
  phone: string;
  notes: string;
  is_active: boolean;
};
