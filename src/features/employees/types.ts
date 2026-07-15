export type EmployeeRecord = {
  id: string;
  user_id: string | null;
  branch_id: string | null;
  full_name: string;
  document_type: string | null;
  document_number: string | null;
  email: string | null;
  phone: string | null;
  role: "owner" | "admin" | "reception" | "barber" | "viewer";
  status: "active" | "inactive" | "blocked";
  position: string | null;
  avatar_url: string | null;
  must_change_password: boolean;
  can_login: boolean;
  login_created_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  branch_name: string | null;
  branch_slug: string | null;
  branch_code: string | null;
};

export type EmployeeFormValue = {
  full_name: string;
  document_type: "" | "dni" | "ce" | "pasaporte" | "ruc" | "otro";
  document_number: string;
  email: string;
  phone: string;
  branch_id: string;
  role: "owner" | "admin" | "reception" | "barber" | "viewer";
  status: "active" | "inactive" | "blocked";
  position: string;
  notes: string;
  can_login: boolean;
  temporary_password: string;
};
