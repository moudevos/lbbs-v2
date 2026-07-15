import { normalizeSlug } from "@/lib/utils/slug";

export function trimOrNull(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseSortOrder(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return 0;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
  }

  return 0;
}

export function normalizeCode(value: string) {
  return normalizeSlug(value).replace(/-/g, "_");
}

export function parseMovementType(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const allowed = new Set([
    "purchase",
    "sale",
    "courtesy",
    "adjustment",
    "waste",
    "transfer_in",
    "transfer_out",
  ]);

  return allowed.has(trimmed) ? trimmed : null;
}

export function toFriendlyDatabaseError(error: {
  code?: string;
  message?: string;
} | null | undefined, fallback: string) {
  if (!error) {
    return fallback;
  }

  if (error.code === "23505") {
    return "Ya existe un registro con ese valor.";
  }

  if (error.code === "23503") {
    return "No se pudo completar la operacion por dependencias relacionadas.";
  }

  if (error.code === "23514") {
    return "Los datos enviados no cumplen las validaciones esperadas.";
  }

  return fallback;
}

export function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}
