export type FunctionalError = { code: string; message: string; httpStatus: number };

export const settlementErrors = {
  SETTLEMENT_PAYMENT_REFERENCE_REQUIRED: { code: "SETTLEMENT_PAYMENT_REFERENCE_REQUIRED", message: "Referencia obligatoria para QR Yape/Plin o transferencia.", httpStatus: 400 },
  SETTLEMENT_PAYMENT_PART_INVALID: { code: "SETTLEMENT_PAYMENT_PART_INVALID", message: "Cada parte de pago requiere método y monto mayor a cero.", httpStatus: 400 },
  SETTLEMENT_PAYMENT_METHOD_INVALID: { code: "SETTLEMENT_PAYMENT_METHOD_INVALID", message: "El método de pago no está disponible para liquidaciones.", httpStatus: 400 },
  SETTLEMENT_PAYMENT_DUPLICATE_METHOD: { code: "SETTLEMENT_PAYMENT_DUPLICATE_METHOD", message: "Cada método de pago puede aparecer una sola vez.", httpStatus: 400 },
  SETTLEMENT_PAYMENT_TOTAL_MISMATCH: { code: "SETTLEMENT_PAYMENT_TOTAL_MISMATCH", message: "La suma de las partes debe coincidir exactamente con el neto de la liquidación.", httpStatus: 400 },
  SETTLEMENT_POS_SESSION_REQUIRED: { code: "SETTLEMENT_POS_SESSION_REQUIRED", message: "No existe una caja POS abierta para registrar la parte en efectivo.", httpStatus: 400 },
  SETTLEMENT_CASH_INSUFFICIENT: { code: "SETTLEMENT_CASH_INSUFFICIENT", message: "El efectivo disponible de la caja no cubre la parte en efectivo de esta liquidación.", httpStatus: 400 },
  SETTLEMENT_DEBT_BALANCE_CHANGED: { code: "SETTLEMENT_DEBT_BALANCE_CHANGED", message: "La deuda reservada ya no tiene saldo suficiente para esta liquidación.", httpStatus: 409 },
  SETTLEMENT_INVALID_STATUS: { code: "SETTLEMENT_INVALID_STATUS", message: "La liquidación no se encuentra en un estado válido para esta acción.", httpStatus: 409 },
  SETTLEMENT_CANCEL_REASON_REQUIRED: { code: "SETTLEMENT_CANCEL_REASON_REQUIRED", message: "El motivo de anulación es obligatorio.", httpStatus: 400 },
  SETTLEMENT_UPDATE_FAILED: { code: "SETTLEMENT_UPDATE_FAILED", message: "No se pudo actualizar la liquidación.", httpStatus: 400 },
} as const satisfies Record<string, FunctionalError>;

export type SettlementErrorCode = keyof typeof settlementErrors;
