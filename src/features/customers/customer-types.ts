export type CustomerRecord = {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
  phone: string;
  phone_normalized: string;
  email: string | null;
  document_type: "DNI" | "CE" | "Pasaporte" | "RUC" | "Otro" | null;
  document_number: string | null;
  birthdate: string | null;
  source: "manual" | "reservation" | "sale" | "import";
  preferred_branch_id: string | null;
  preferred_branch_name: string | null;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerFormValue = {
  first_name: string;
  last_name: string;
  business_name: string;
  phone: string;
  email: string;
  document_type: "" | "DNI" | "CE" | "Pasaporte" | "RUC" | "Otro";
  document_number: string;
  birthdate: string;
  notes: string;
};
