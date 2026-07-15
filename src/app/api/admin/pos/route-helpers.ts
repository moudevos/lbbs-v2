import type { SupabaseClient } from "@supabase/supabase-js";

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

export function formatSaleReference(saleId: string) {
  return `VTA-${saleId.slice(0, 8).toUpperCase()}`;
}

export function mapPosErrorMessage(message: string | null | undefined) {
  const normalized = (message ?? "").trim();

  if (!normalized) {
    return "No se pudo completar la operacion de POS.";
  }

  if (
    normalized.includes("pagos registrados no cubren el total") ||
    normalized.includes("no cubre el total")
  ) {
    return "El monto pagado no cubre el total.";
  }

  if (normalized.includes("Stock insuficiente")) {
    return "Stock insuficiente para uno o mas productos.";
  }

  if (normalized.includes("reward ya no esta disponible")) {
    return "Este reward ya fue canjeado.";
  }

  if (normalized.includes("reward seleccionado no existe")) {
    return "Este reward ya fue canjeado.";
  }

  if (normalized.includes("POS tarjeta no puede exceder el saldo pendiente")) {
    return "El pago con POS tarjeta no puede exceder el saldo pendiente.";
  }

  if (normalized.includes("pago QR no puede exceder el saldo pendiente")) {
    return "El pago QR no puede exceder el saldo pendiente.";
  }

  if (normalized.includes("precio del producto no coincide con el catalogo actual")) {
    return "El precio de este producto no permite edicion manual.";
  }

  if (normalized.includes("precio del servicio no coincide con el catalogo actual")) {
    return "El precio de este servicio no permite edicion manual.";
  }

  if (normalized.includes("precio del item personalizado")) {
    return "Ingresa el precio del item personalizado.";
  }

  if (normalized.includes("sesion POS")) {
    return normalized;
  }

  if (normalized.includes("barbero")) {
    return "Selecciona el barbero que realizo el servicio.";
  }

  if (normalized.includes("motivo de anulacion")) {
    return "Debes indicar el motivo de anulacion.";
  }

  return normalized;
}

export async function appendReservationNote(
  supabase: SupabaseClient,
  reservationId: string | null,
  employeeId: string | null,
  note: string,
) {
  if (!reservationId) {
    return;
  }

  const { error } = await supabase.from("reservation_notes").insert({
    reservation_id: reservationId,
    employee_id: employeeId,
    note,
  });

  if (error) {
    console.error("[pos/reservas] No se pudo registrar la nota de reserva", {
      reservationId,
      message: error.message,
      code: error.code,
    });
  }
}
