"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PosSessionGate } from "@/features/pos/PosSessionGate";
import type {
  OpenPosSessionPayload,
  PosBranchRecord,
  PosRole,
  PosSessionRecord,
} from "@/features/pos/pos-types";
import { cn } from "@/lib/utils/cn";

type PosSessionOverviewProps = {
  role: PosRole;
  branches: PosBranchRecord[];
  selectedBranchId: string;
  activeSession: PosSessionRecord | null;
  openSessions: PosSessionRecord[];
  openSessionForm: OpenPosSessionPayload;
  isOpeningSession: boolean;
  isBranchLocked: boolean;
  onBranchChange: (branchId: string) => void;
  onFormChange: (next: OpenPosSessionPayload) => void;
  onOpenSession: () => Promise<boolean> | boolean;
  onCloseSessionRequest?: () => void;
  onResumeSession?: () => void;
  isCloseSessionDisabled?: boolean;
  compact?: boolean;
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "Sin registro";
  }

  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function PosSessionOverview({
  role,
  branches,
  selectedBranchId,
  activeSession,
  openSessions,
  openSessionForm,
  isOpeningSession,
  isBranchLocked,
  onBranchChange,
  onFormChange,
  onOpenSession,
  onCloseSessionRequest,
  onResumeSession,
  isCloseSessionDisabled = false,
  compact = false,
}: PosSessionOverviewProps) {
  const canManageAllBranches = role === "owner" || role === "admin";
  const currentBranch =
    branches.find((branch) => branch.id === (activeSession?.branch_id ?? selectedBranchId)) ?? null;

  return (
    <div className="space-y-4">
      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
              Punto de venta
            </div>
            <div>
              <p className="text-lg font-semibold text-slate-900">Sesion POS</p>
              <p className="mt-1 text-sm text-slate-600">
                {activeSession
                  ? "La caja esta lista para abrir la vista operativa."
                  : "Abre una sesion por sede antes de ingresar al POS."}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={activeSession ? `/pos?session_id=${activeSession.id}` : "/pos"}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex h-11 items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-white",
                (!activeSession || activeSession.status === "pending_close") &&
                  "pointer-events-none opacity-60",
              )}
            >
              Abrir POS
            </Link>

            {!activeSession ? (
              <PosSessionGate
                role={role}
                branches={branches}
                selectedBranchId={selectedBranchId}
                activeSession={activeSession}
                openSessions={openSessions}
                openSessionForm={openSessionForm}
                isOpeningSession={isOpeningSession}
                isBranchLocked={isBranchLocked}
                onBranchChange={onBranchChange}
                onFormChange={onFormChange}
                onOpenSession={onOpenSession}
                compact
              />
            ) : null}

            {activeSession ? (
              <Button
                type="button"
                disabled={isCloseSessionDisabled}
                className="bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:bg-slate-100 disabled:text-slate-500"
                onClick={onCloseSessionRequest}
              >
                Cerrar sesion POS
              </Button>
            ) : null}

            {activeSession?.status === "pending_close" ? (
              <Button type="button" className="bg-amber-700 hover:bg-amber-600" onClick={onResumeSession}>
                Reabrir interfaz
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
              Estado
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-900">
              {activeSession?.status === "pending_close"
                ? "Pendiente de cierre"
                : activeSession
                  ? "Sesion abierta"
                  : "Sin sesion activa"}
            </p>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
              Sede
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-900">
              {activeSession?.branch_name ?? currentBranch?.name ?? "Sin seleccionar"}
            </p>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
              Abierta por
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-900">
              {activeSession?.opened_by_name ?? activeSession?.opened_by ?? "Pendiente"}
            </p>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
              Apertura
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-900">
              {formatDateTime(activeSession?.opened_at ?? null)}
            </p>
          </article>
        </div>
      </section>

      {(canManageAllBranches || (!compact && openSessions.length > 0 && !activeSession)) ? (
        <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Sesiones abiertas</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {openSessions.map((session) => (
              <article
                key={session.id}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
              >
                <p className="text-sm font-semibold text-slate-900">
                  {session.branch_name ?? "Sede"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Abierta por {session.opened_by_name ?? "Sin usuario"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {formatDateTime(session.opened_at)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Total ventas: {session.total_sales_amount ?? "0.00"}
                </p>
                <Link
                  href={`/pos?session_id=${session.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex h-9 items-center justify-center rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white transition hover:bg-emerald-500"
                >
                  {session.status === "pending_close" ? "Revisar cierre" : "Entrar al POS"}
                </Link>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
