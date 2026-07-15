export function trimOrNull(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseNumber(value: unknown) {
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

export function parseInteger(value: unknown) {
  const parsed = parseNumber(value);
  return parsed === null ? null : Math.trunc(parsed);
}

export function toFriendlyRewardsError(error: {
  code?: string;
  message?: string;
} | null | undefined, fallback: string) {
  if (!error) {
    return fallback;
  }

  if (error.code === "23505") {
    return "Ya existe un registro con esos datos.";
  }

  if (error.code === "23503") {
    return "No se pudo completar la operacion por dependencias relacionadas.";
  }

  if (error.code === "23514") {
    return "Los datos enviados no cumplen las validaciones requeridas.";
  }

  return fallback;
}

export function mapRewardsErrorMessage(message: string | null | undefined) {
  const normalized = (message ?? "").trim();

  if (!normalized) {
    return "No se pudo completar la operacion de rewards.";
  }

  if (normalized.includes("Cliente varios")) {
    return "Cliente varios no participa en rewards.";
  }

  if (normalized.includes("reward") || normalized.includes("Rewards") || normalized.includes("recompensa")) {
    return normalized;
  }

  if (normalized.includes("migracion")) {
    return normalized;
  }

  return normalized;
}
