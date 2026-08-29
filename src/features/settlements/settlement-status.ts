export const settlementStatusLabels: Record<string, string> = {
  draft: "Borrador",
  review: "Confirmada",
  approved: "Aprobada",
  paid: "Pagada",
  cancelled: "Anulada",
};

export function getSettlementStatusLabel(status: string | null | undefined) {
  return settlementStatusLabels[status ?? ""] ?? "Sin estado";
}
