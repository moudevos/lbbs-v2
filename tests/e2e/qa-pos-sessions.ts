import type { APIRequestContext, APIResponse } from "@playwright/test";

type Session = {
  id: string;
  branchId: string;
  status: "open" | "pending_close" | "closed" | "cancelled";
};

type CloseSummary = {
  openingNotes: string | null;
  paymentMethods: Array<{
    paymentMethodId: string;
    expectedAmount: number;
  }>;
};

const QA_SESSION_PREFIXES = ["QA_E2E_", "QA_RUN_"] as const;

function isQaSession(openingNotes: string | null) {
  return QA_SESSION_PREFIXES.some((prefix) => openingNotes?.startsWith(prefix) === true);
}

async function payload<T>(response: APIResponse) {
  const body = await response.text();
  try {
    return JSON.parse(body) as T & { error?: string };
  } catch {
    throw new Error(`Respuesta no JSON de sesiones POS (${response.status()}).`);
  }
}

async function ensureOk<T>(response: APIResponse) {
  const data = await payload<T>(response);
  if (!response.ok()) {
    throw new Error(data.error ?? `La API de sesiones POS respondio ${response.status()}.`);
  }
  return data;
}

export async function closeQaOpenSessions(
  request: APIRequestContext,
  branchId: string,
  runCode: string,
) {
  const sessions = (await ensureOk<{ data: Session[] }>(
    await request.get(`/api/admin/pos/sessions?branchId=${branchId}`),
  )).data;

  for (const session of sessions) {
    if (session.branchId !== branchId || !["open", "pending_close"].includes(session.status)) {
      continue;
    }

    const summary = (await ensureOk<{ data: CloseSummary }>(
      await request.get(`/api/admin/pos/sessions/${session.id}/close`),
    )).data;
    if (!isQaSession(summary.openingNotes)) {
      throw new Error(
        `BLOCKED: existe una sesión POS activa no identificada como QA para esta sede. sessionId=${session.id} branchId=${branchId}`,
      );
    }

    const countedAmounts = Object.fromEntries(
      summary.paymentMethods.map((method) => [
        method.paymentMethodId,
        Math.max(0, Number(method.expectedAmount)),
      ]),
    );
    await ensureOk(
      await request.post(`/api/admin/pos/sessions/${session.id}/close`, {
        data: {
          counted_amounts: countedAmounts,
          notes: `${runCode} cierre tecnico de sesion QA previa`,
        },
      }),
    );
  }
}

export async function openFreshQaSession(
  request: APIRequestContext,
  branchId: string,
  openingCashAmount: number,
  runCode: string,
) {
  if (!QA_SESSION_PREFIXES.some((prefix) => runCode.startsWith(prefix))) {
    throw new Error("El runCode de la sesión POS QA debe usar un prefijo QA aprobado.");
  }
  await closeQaOpenSessions(request, branchId, runCode);
  return (await ensureOk<{ data: Session }>(
    await request.post("/api/admin/pos/sessions/open", {
      data: {
        branch_id: branchId,
        opening_cash_amount: openingCashAmount,
        notes: `${runCode} QA_E2E_POS_SESSION`,
      },
    }),
  )).data;
}
