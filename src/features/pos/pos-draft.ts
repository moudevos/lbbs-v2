import type {
  PosCartItem,
  PosCustomerRecord,
  PosPreparedPayment,
} from "@/features/pos/pos-types";

const draftVersion = 3;

export type PosDraft = {
  version: number;
  savedAt: string;
  sessionId: string;
  branchId: string;
  employeeId: string;
  customer: PosCustomerRecord | null;
  reservationId: string | null;
  barberId: string;
  rewardEntitlementId: string;
  internalBenefitRuleId: string;
  internalCredit: boolean;
  internalAuthorizationReason: string;
  items: PosCartItem[];
  payments: PosPreparedPayment[];
  checkoutIdempotencyKey: string | null;
};

export function getPosDraftKey(sessionId: string, branchId: string, employeeId: string) {
  return `lbbs:pos:draft:v${draftVersion}:${sessionId}:${branchId}:${employeeId}`;
}

export function readPosDraft(key: string): PosDraft | null {
  try {
    const value = window.localStorage.getItem(key);
    if (!value) return null;

    const parsed = JSON.parse(value) as PosDraft;
    if (
      parsed.version !== draftVersion ||
      !parsed.sessionId ||
      !parsed.branchId ||
      !parsed.employeeId ||
      !Array.isArray(parsed.items) ||
      !Array.isArray(parsed.payments)
    ) {
      window.localStorage.removeItem(key);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function writePosDraft(key: string, draft: PosDraft) {
  try {
    window.localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Si el almacenamiento no esta disponible, el POS sigue funcionando sin persistencia local.
  }
}

export function removePosDraft(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // No se requiere accion adicional si el navegador bloquea el almacenamiento local.
  }
}
