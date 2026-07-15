"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { OpenSessionModal } from "@/features/pos/OpenSessionModal";
import type {
  OpenPosSessionPayload,
  PosBranchRecord,
  PosRole,
  PosSessionRecord,
} from "@/features/pos/pos-types";

type PosSessionGateProps = {
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
  compact?: boolean;
};

export function PosSessionGate({
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
  compact = false,
}: PosSessionGateProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId) ?? null;

  if (activeSession) {
    return null;
  }

  return (
    <>
      <section
        className={
          compact
            ? "contents"
            : "rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        }
      >
        <div className="space-y-4">
          {!compact ? (
            <div>
              <p className="text-lg font-semibold text-slate-900">POS listo para apertura</p>
              <p className="mt-2 text-sm text-slate-600">
                {selectedBranch
                  ? `No hay una sesión POS abierta para ${selectedBranch.name}.`
                  : "Selecciona una sede y abre una sesión POS para comenzar."}
              </p>
            </div>
          ) : null}

          {!compact && (role === "owner" || role === "admin") ? (
            <div className="flex flex-wrap gap-2">
              {branches.map((branch) => (
                <Button
                  key={branch.id}
                  type="button"
                  className={
                    branch.id === selectedBranchId
                      ? "h-10"
                      : "h-10 bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }
                  onClick={() => onBranchChange(branch.id)}
                >
                  {branch.name}
                </Button>
              ))}
            </div>
          ) : null}

          {!compact && openSessions.length > 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">Sesiones abiertas visibles</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {openSessions.map((session) => (
                  <article
                    key={session.id}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-3"
                  >
                    <p className="text-sm font-semibold text-slate-900">
                      {session.branch_name ?? "Sede"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Abierta {new Date(session.opened_at).toLocaleTimeString("es-PE")}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          <Button type="button" onClick={() => setIsModalOpen(true)}>
            Abrir sesión POS
          </Button>
        </div>
      </section>

      <OpenSessionModal
        open={isModalOpen}
        branches={branches}
        value={openSessionForm}
        isSaving={isOpeningSession}
        isBranchLocked={isBranchLocked}
        onClose={() => setIsModalOpen(false)}
        onChange={onFormChange}
        onSubmit={async () => {
          const opened = await onOpenSession();
          if (opened) {
            setIsModalOpen(false);
          }
        }}
      />
    </>
  );
}
