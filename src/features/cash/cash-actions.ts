import type {
  CashBootstrapPayload,
  CashFilters,
  CashMovementFormValue,
} from "@/features/cash/cash-types";

export async function fetchCashBootstrap(filters: CashFilters) {
  const params = new URLSearchParams();

  if (filters.branchId) {
    params.set("branchId", filters.branchId);
  }

  if (filters.date) {
    params.set("date", filters.date);
  }

  if (filters.movementType) {
    params.set("movementType", filters.movementType);
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.categoryId) {
    params.set("categoryId", filters.categoryId);
  }

  const query = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`/api/admin/cash/bootstrap${query}`, {
    cache: "no-store",
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "No se pudo cargar la caja operativa.");
  }

  return payload as CashBootstrapPayload;
}

export async function createCashMovement(
  posSessionId: string,
  value: CashMovementFormValue,
) {
  const response = await fetch("/api/admin/cash/movements", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pos_session_id: posSessionId,
      category_id: value.category_id,
      movement_type: value.movement_type,
      amount: value.amount,
      description: value.description,
      evidence_url: value.evidence_url,
    }),
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "No se pudo registrar el movimiento.");
  }

  return payload.data;
}

export async function cancelCashMovement(movementId: string, reason: string) {
  const response = await fetch(`/api/admin/cash/movements/${movementId}/cancel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reason }),
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "No se pudo anular el movimiento.");
  }

  return payload.data;
}
