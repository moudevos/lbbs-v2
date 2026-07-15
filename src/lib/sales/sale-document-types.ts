export type SaleDocumentPayload = {
  schema_version: "1.0";
  document_type: "internal_ticket";
  currency: "PEN";
  sale: { id: string; number: string; issued_at: string; status: "completed" | "cancelled"; cancellation?: { cancelled_at: string | null; cancelled_by: string | null; reason: string | null; notes: string | null } | null };
  issuer: { business_name: string; trade_name: string; tax_id: null };
  branch: { id: string; code: string | null; name: string; address: string | null; phone: string | null };
  customer: { id: string; document_type: string | null; document_number: string | null; name: string; phone: string | null };
  employees: { cashier: { id: string | null; name: string | null }; barber: { id: string | null; name: string | null } };
  items: Array<{ type: "service" | "product"; reference_id: string | null; sku: string | null; description: string; quantity: number; unit_price: number; gross_amount: number; commercial_discount: number; reward_discount: number; courtesy_discount: number; net_amount: number }>;
  reward: { entitlement_id: string; name: string; amount: number } | null;
  totals: { gross_amount: number; commercial_discount: number; reward_discount: number; courtesy_discount: number; payable_amount: number; paid_amount: number; change_amount: number };
  payments: Array<{ method_code: string; method_name: string; applied_amount: number; tendered_amount: number; change_amount: number; reference: string | null }>;
  future_see: { document_code: null; series: null; correlative: null; operation_type: null; taxable_amount: null; tax_amount: null };
  metadata: { source: "LBBS_POS"; generated_at: string; non_fiscal: true };
};
