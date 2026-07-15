export function trimOrNull(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseMoney(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function toMoneyNumber(value: unknown) {
  const parsed = parseMoney(value);
  return parsed === null ? 0 : Number(parsed.toFixed(2));
}

export function isValidCashMovementType(value: unknown): value is "income" | "expense" | "adjustment" {
  return value === "income" || value === "expense" || value === "adjustment";
}

export function isValidCashMovementStatus(value: unknown): value is "active" | "cancelled" {
  return value === "active" || value === "cancelled";
}

export function isValidIsoDate(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export function mapCashErrorMessage(message: string | null | undefined) {
  const normalized = (message ?? "").trim();

  if (!normalized) {
    return "No se pudo completar la operacion de caja.";
  }

  if (
    normalized.includes("sesion POS no existe") ||
    normalized.includes("sesion POS ya esta cerrada") ||
    normalized.includes("sesion cerrada") ||
    normalized.includes("No se pueden registrar movimientos en una sesion cerrada")
  ) {
    return normalized;
  }

  if (normalized.includes("categoria")) {
    return normalized;
  }

  if (normalized.includes("monto")) {
    return normalized;
  }

  if (normalized.includes("descripcion")) {
    return normalized;
  }

  if (normalized.includes("motivo de anulacion")) {
    return "Debes indicar el motivo de anulacion.";
  }

  if (normalized.includes("No tienes permisos")) {
    return "No tienes permiso para operar en esta caja.";
  }

  return normalized;
}
