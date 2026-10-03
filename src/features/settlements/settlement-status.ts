export const settlementStatusLabels: Record<string, string> = {
  draft: "Borrador",
  review: "Confirmación pendiente",
  approved: "Confirmada",
  paid: "Pagada",
  cancelled: "Anulada",
};

export function getSettlementStatusLabel(status: string | null | undefined) {
  return settlementStatusLabels[status ?? ""] ?? "Sin estado";
}
