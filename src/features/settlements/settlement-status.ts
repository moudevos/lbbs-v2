export const settlementStatusLabels: Record<string, string> = {
  draft: "Borrador",
  review: "En revisión",
  approved: "Aprobada",
  paid: "Pagada",
  cancelled: "Anulada",
};

export function getSettlementStatusLabel(status: string | null | undefined) {
  return settlementStatusLabels[status ?? ""] ?? "Sin estado";
}
