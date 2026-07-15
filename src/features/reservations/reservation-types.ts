import type { CustomerRecord } from "@/features/customers/customer-types";

export type ReservationStatus =
  | "pending"
  | "contacted"
  | "confirmed"
  | "rescheduled"
  | "checked_in"
  | "completed"
  | "cancelled"
  | "no_show";

export type ReservationSource = "manual" | "public_form" | "whatsapp" | "phone";

export type ReservationChannel = "reception" | "website" | "whatsapp" | "phone";

export type ReservationRecord = {
  id: string;
  customer_id: string;
  branch_id: string | null;
  preferred_barber_id: string | null;
  service_interest_id: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  status: ReservationStatus;
  source: ReservationSource;
  channel: ReservationChannel;
  customer_message: string | null;
  internal_notes: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  customer_name: string;
  customer_phone: string;
  customer_phone_normalized: string;
  customer_document_type: string | null;
  customer_document_number: string | null;
  branch_name: string | null;
  branch_slug: string | null;
  preferred_barber_name: string | null;
  service_interest_name: string | null;
  notes_count: number;
};

export type ReservationDetailRecord = ReservationRecord & {
  notes: ReservationNoteRecord[];
};

export type ReservationNoteRecord = {
  id: string;
  reservation_id: string;
  employee_id: string | null;
  employee_name: string | null;
  note: string;
  created_at: string;
};

export type ReservationFormValue = {
  customer_id: string;
  branch_id: string;
  preferred_barber_id: string;
  service_interest_id: string;
  scheduled_date: string;
  scheduled_time: string;
  status: ReservationStatus;
  source: ReservationSource;
  channel: ReservationChannel;
  customer_message: string;
  internal_notes: string;
};

export type ReservationFilters = {
  search: string;
  status: string;
  branchId: string;
  scheduledDate: string;
};

export type ReservationCustomerOption = Pick<
  CustomerRecord,
  | "id"
  | "full_name"
  | "first_name"
  | "last_name"
  | "business_name"
  | "phone"
  | "phone_normalized"
  | "document_type"
  | "document_number"
  | "email"
  | "is_active"
>;
