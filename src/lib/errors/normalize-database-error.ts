import { settlementErrors, type FunctionalError } from "@/lib/errors/error-catalog";

type DatabaseError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  constraint?: string | null;
};

const byMessage: Array<[string, keyof typeof settlementErrors]> = [
  ["referencia es obligatoria", "SETTLEMENT_PAYMENT_REFERENCE_REQUIRED"],
  ["cada parte requiere", "SETTLEMENT_PAYMENT_PART_INVALID"],
  ["método de pago no está disponible", "SETTLEMENT_PAYMENT_METHOD_INVALID"],
  ["método de pago puede aparecer", "SETTLEMENT_PAYMENT_DUPLICATE_METHOD"],
  ["suma de las partes", "SETTLEMENT_PAYMENT_TOTAL_MISMATCH"],
  ["sesión pos abierta", "SETTLEMENT_POS_SESSION_REQUIRED"],
  ["efectivo disponible de la caja", "SETTLEMENT_CASH_INSUFFICIENT"],
  ["deuda reservada", "SETTLEMENT_DEBT_BALANCE_CHANGED"],
  ["debe estar aprobada", "SETTLEMENT_INVALID_STATUS"],
  ["solo una liquidación en borrador", "SETTLEMENT_INVALID_STATUS"],
  ["motivo de anulación", "SETTLEMENT_CANCEL_REASON_REQUIRED"],
  ["observación es obligatoria", "SETTLEMENT_CANCEL_REASON_REQUIRED"],
];

export function normalizeDatabaseError(error: DatabaseError): FunctionalError {
  const message = `${error.message ?? ""} ${error.details ?? ""}`.toLocaleLowerCase("es-PE");
  const entry = byMessage.find(([fragment]) => message.includes(fragment));
  return settlementErrors[entry?.[1] ?? "SETTLEMENT_UPDATE_FAILED"];
}
