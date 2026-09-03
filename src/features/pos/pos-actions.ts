import type {
  ClosePosSessionPayload,
  OpenPosSessionPayload,
  PosCheckoutPayload,
  PosInternalCustomerOptions,
  PosRewardEntitlement,
  PosSessionCloseSummary,
  PosSessionHistoryRecord,
} from "@/features/pos/pos-types";

export async function fetchPosBootstrap(branchId?: string, sessionId?: string, reservationId?: string) {
  const params = new URLSearchParams();
  if (branchId) {
    params.set("branchId", branchId);
  }
  if (sessionId) {
    params.set("sessionId", sessionId);
  }
  if (reservationId) params.set("reservationId", reservationId);
  const query = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`/api/admin/pos/bootstrap${query}`, {
    cache: "no-store",
  });
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    throw new Error(
      response.status === 404
        ? "La ruta de carga del POS no esta disponible. Reinicia el servidor de desarrollo."
        : "El servidor devolvio una respuesta no valida al cargar el POS.",
    );
  }

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "No se pudo cargar el POS.");
  }

  return payload;
}

export async function fetchPosInternalCustomerOptions(customerId: string, branchId: string) {
  const params = new URLSearchParams({ customerId, branchId });
  const response = await fetch(`/api/admin/pos/internal-options?${params.toString()}`, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "No se pudieron cargar las opciones internas.");
  const options = payload.data as PosInternalCustomerOptions;
  if (options.beneficiaryType === "socio") {
    return { ...options, rules: options.rules.filter((rule) => rule.beneficiary_scope === "socio") };
  }
  return options;
}

export async function verifyPosInternalAuthorizationPin(pin: string, branchId: string) {
  const response = await fetch("/api/admin/pos/internal-authorization", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin, branchId }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "No se pudo verificar el PIN de autorización.");
  return true;
}

export async function openPosSession(payload: OpenPosSessionPayload) {
  const response = await fetch("/api/admin/pos/sessions/open", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "No se pudo abrir la sesion POS.");
  }

  return result;
}

export async function fetchPosServices(branchId: string) {
  const response = await fetch(`/api/admin/services?branchId=${encodeURIComponent(branchId)}`, {
    cache: "no-store",
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "No se pudieron cargar los servicios.");
  }

  return payload.data ?? [];
}

export async function fetchPosProducts(branchId: string) {
  const response = await fetch(`/api/admin/products?branchId=${encodeURIComponent(branchId)}`, {
    cache: "no-store",
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "No se pudieron cargar los productos.");
  }

  return payload.data ?? [];
}

export async function searchPosCustomers(query: string) {
  const response = await fetch(
    `/api/admin/customers/search?q=${encodeURIComponent(query)}&limit=8`,
    {
      cache: "no-store",
    },
  );
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "No se pudieron buscar los clientes.");
  }

  return payload.data ?? [];
}

export async function fetchPosEmployees() {
  const response = await fetch("/api/admin/employees", {
    cache: "no-store",
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "No se pudo cargar el equipo.");
  }

  return payload.data ?? [];
}

export async function fetchPosAvailableRewards(customerId: string) {
  const response = await fetch(
    `/api/admin/rewards/available?customerId=${encodeURIComponent(customerId)}`,
    {
      cache: "no-store",
    },
  );
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "No se pudieron cargar los rewards disponibles.");
  }

  return (payload.data ?? []) as PosRewardEntitlement[];
}

export async function checkoutPosSale(payload: PosCheckoutPayload) {
  const response = await fetch("/api/admin/pos/checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "No se pudo cerrar la venta.");
  }

  return result.data;
}

export async function fetchRecentPosSales(sessionId: string) {
  const response = await fetch(
    `/api/admin/pos/sales/recent?sessionId=${encodeURIComponent(sessionId)}`,
    {
      cache: "no-store",
    },
  );
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "No se pudieron cargar las ventas recientes.");
  }

  return payload.data ?? [];
}

export async function cancelCompletedPosSale(saleId: string, reasonId: string, notes: string) {
  const response = await fetch(`/api/admin/pos/sales/${saleId}/cancel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reasonId, notes }),
  });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "No se pudo anular la venta.");
  }

  return result.data;
}

export async function fetchPosSessionCloseSummary(
  sessionId: string,
): Promise<PosSessionCloseSummary> {
  const response = await fetch(`/api/admin/pos/sessions/${sessionId}/close`, {
    cache: "no-store",
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "No se pudo cargar el cierre de sesion.");
  }

  return payload.data as PosSessionCloseSummary;
}

export async function fetchPosSessionHistory(filters?: {
  branchId?: string;
  date?: string;
  status?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.branchId) params.set("branchId", filters.branchId);
  if (filters?.date) params.set("date", filters.date);
  if (filters?.status) params.set("status", filters.status);

  const query = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`/api/admin/pos/sessions${query}`, { cache: "no-store" });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "No se pudo cargar el historial de sesiones.");
  }

  return (payload.data ?? []) as PosSessionHistoryRecord[];
}

export async function closePosSession(sessionId: string, payload: ClosePosSessionPayload) {
  const response = await fetch(`/api/admin/pos/sessions/${sessionId}/close`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "No se pudo cerrar la sesion POS.");
  }

  return result.data as PosSessionCloseSummary;
}

export async function resumePosSession(sessionId: string) {
  const response = await fetch(`/api/admin/pos/sessions/${sessionId}/resume`, { method: "POST" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "No se pudo reabrir la sesión POS.");
  return payload.data;
}
