export type CashRole = "owner" | "admin" | "reception" | "barber" | "viewer";

export type CashBranchRecord = {
  id: string;
  code: string | null;
  name: string;
  slug: string;
  short_name: string | null;
  is_active: boolean;
};

export type CashEmployeeRecord = {
  id: string;
  branch_id: string | null;
  full_name: string;
  role: CashRole;
  status: "active" | "inactive" | "blocked";
};

export type CashMovementCategoryRecord = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  movement_direction: "income" | "expense" | "adjustment";
  sort_order: number;
  is_active: boolean;
};

export type CashSessionRecord = {
  id: string;
  branch_id: string;
  branch_name: string | null;
  branch_code: string | null;
  branch_slug: string | null;
  business_date: string;
  status: "open" | "closed";
  opening_cash_amount: string;
  expected_cash_amount: string;
  total_sales_amount: string;
  total_cash_amount: string;
  opened_at: string;
  opening_notes: string | null;
  opened_by: string | null;
  opened_by_name: string | null;
};

export type CashSummaryRecord = {
  branchId: string;
  branchName: string | null;
  sessionId: string | null;
  status: "open" | "closed" | null;
  openingCashAmount: number;
  cashSalesAmount: number;
  operationalIncome: number;
  operationalExpense: number;
  withdrawals: number;
  adjustments: number;
  netOperationalAmount: number;
  expectedCashAmount: number;
  totalSalesAmount: number;
  openedAt: string | null;
  openedByName: string | null;
};

export type CashMovementRecord = {
  id: string;
  pos_session_id: string;
  branch_id: string;
  category_id: string | null;
  movement_type: "income" | "expense" | "adjustment";
  amount: string;
  description: string;
  evidence_url: string | null;
  status: "active" | "cancelled";
  created_by: string | null;
  created_by_name: string | null;
  cancelled_by: string | null;
  cancelled_by_name: string | null;
  cancelled_reason: string | null;
  created_at: string;
  cancelled_at: string | null;
  updated_at: string;
  category_name: string | null;
  category_code: string | null;
  category_direction: "income" | "expense" | "adjustment" | null;
};

export type CashFilters = {
  branchId: string;
  date: string;
  movementType: "" | "income" | "expense" | "withdrawal" | "adjustment";
  status: "" | "active" | "cancelled";
  categoryId: string;
};

export type CashMovementFormValue = {
  movement_type: "" | "income" | "expense" | "adjustment";
  category_id: string;
  amount: string;
  description: string;
  evidence_url: string;
};

export type CashBootstrapPayload = {
  role: CashRole;
  employee: CashEmployeeRecord | null;
  branches: CashBranchRecord[];
  selectedBranchId: string;
  openSessions: CashSessionRecord[];
  activeSession: CashSessionRecord | null;
  categories: CashMovementCategoryRecord[];
  summary: CashSummaryRecord | null;
  movements: CashMovementRecord[];
};
