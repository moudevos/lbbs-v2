"use client";

import { useState } from "react";
import Swal from "sweetalert2";

import { Button } from "@/components/ui/button";
import { closePosSession, fetchPosSessionCloseSummary, resumePosSession } from "@/features/pos/pos-actions";
import { PosSessionOverview } from "@/features/pos/PosSessionOverview";
import { PosSessionCloseModal } from "@/features/pos/PosSessionCloseModal";
import { PosSessionHistory } from "@/features/pos/PosSessionHistory";
import type { PosSessionCloseSummary } from "@/features/pos/pos-types";
import { usePosWorkspace } from "@/features/pos/usePosWorkspace";

export function PosPageClient() {
  const {
    activeSession,
    bootstrap,
    branches,
    isBranchLocked,
    isLoading,
    isOpeningSession,
    loadBootstrap,
    openSessionForm,
    selectedBranchId,
    handleOpenSession,
    setOpenSessionForm,
    setSelectedBranchId,
  } = usePosWorkspace();
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [closeSummary, setCloseSummary] = useState<PosSessionCloseSummary | null>(null);
  const [countedAmounts, setCountedAmounts] = useState<Record<string, string>>({});
  const [closingNotes, setClosingNotes] = useState("");
  const [isLoadingCloseSummary, setIsLoadingCloseSummary] = useState(false);
  const [isClosingSession, setIsClosingSession] = useState(false);

  if (isLoading || !bootstrap) {
    return (
      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-600">Cargando POS...</p>
      </section>
    );
  }

  async function handleOpenCloseModal() {
    if (!activeSession) {
      return;
    }

    setIsCloseModalOpen(true);
    setIsLoadingCloseSummary(true);

    try {
      const summary = await fetchPosSessionCloseSummary(activeSession.id);
      setCloseSummary(summary);
      setCountedAmounts(
        Object.fromEntries(summary.paymentMethods.map((method) => [method.paymentMethodId, "0"])),
      );
      setClosingNotes(summary.closingNotes ?? "");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[pos/ui] Error al cargar cierre de sesion", {
        message,
        sessionId: activeSession.id,
      });
      await Swal.fire({
        icon: "error",
        title: "No se pudo cargar el cierre de sesion",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      setIsCloseModalOpen(false);
    } finally {
      setIsLoadingCloseSummary(false);
    }
  }

  async function handleCloseSession() {
    if (!activeSession) {
      return;
    }

    const result = await Swal.fire({
      icon: "question",
      title: "Cerrar sesion POS",
      text: "Confirma el cierre de caja con el efectivo contado actual.",
      showCancelButton: true,
      confirmButtonText: "Cerrar sesion",
      cancelButtonText: "Seguir revisando",
      confirmButtonColor: "#0f766e",
      background: "#ffffff",
      color: "#0f172a",
    });

    if (!result.isConfirmed) {
      return;
    }

    setIsClosingSession(true);

    try {
      await closePosSession(activeSession.id, {
        counted_amounts: countedAmounts,
        notes: closingNotes,
      });
      await loadBootstrap(selectedBranchId);
      setIsCloseModalOpen(false);
      setCloseSummary(null);
      await Swal.fire({
        icon: "success",
        title: "Sesion POS cerrada",
        text: "La caja se cerro correctamente.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[pos/ui] Error al cerrar sesion POS", {
        message,
        sessionId: activeSession.id,
      });
      await Swal.fire({
        icon: "error",
        title: "No se pudo cerrar la sesion POS",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } finally {
      setIsClosingSession(false);
    }
  }

  async function handleResumeSession() {
    if (!activeSession) return;
    try {
      await resumePosSession(activeSession.id);
      await loadBootstrap(selectedBranchId);
      await Swal.fire({ icon: "success", title: "POS reabierto", text: "La sesión de hoy volvió a estar disponible para operar.", confirmButtonColor: "#0f766e" });
    } catch (error) {
      await Swal.fire({ icon: "error", title: "No se pudo reabrir", text: error instanceof Error ? error.message : "Error inesperado", confirmButtonColor: "#0f766e" });
    }
  }

  return (
    <>
      {activeSession?.status === "pending_close" ? (
        <section className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-amber-900">Hay una sesion pendiente de cierre.</p>
            <p className="mt-1 text-sm text-amber-800">Si es de hoy y fue marcada por error, puedes reabrir solo su interfaz. Las jornadas anteriores deben cerrarse.</p>
          </div>
          <Button type="button" className="bg-amber-700 hover:bg-amber-600" onClick={() => void handleOpenCloseModal()}>
            Cerrar sesion pendiente
          </Button>
          <Button type="button" className="bg-slate-800 hover:bg-slate-700" onClick={() => void handleResumeSession()}>
            Reabrir interfaz POS
          </Button>
        </section>
      ) : null}

      <PosSessionOverview
        role={bootstrap.role}
        branches={branches}
        selectedBranchId={selectedBranchId}
        activeSession={activeSession}
        openSessions={bootstrap.openSessions}
        openSessionForm={openSessionForm}
        isOpeningSession={isOpeningSession}
        isBranchLocked={isBranchLocked}
        onBranchChange={(branchId) => {
          setSelectedBranchId(branchId);
          setOpenSessionForm((current) => ({ ...current, branch_id: branchId }));
        }}
        onFormChange={setOpenSessionForm}
        onOpenSession={handleOpenSession}
        onCloseSessionRequest={() => {
          void handleOpenCloseModal();
        }}
        onResumeSession={() => { void handleResumeSession(); }}
        isCloseSessionDisabled={!activeSession}
        compact={Boolean(activeSession)}
      />

      <div className="mt-4">
        <PosSessionHistory
          branches={branches}
          onSessionClosed={async () => {
            await loadBootstrap(selectedBranchId);
          }}
        />
      </div>

      <PosSessionCloseModal
        open={isCloseModalOpen}
        summary={closeSummary}
        countedAmounts={countedAmounts}
        notes={closingNotes}
        isLoading={isLoadingCloseSummary}
        isSubmitting={isClosingSession}
        onCountedAmountChange={(methodId, value) =>
          setCountedAmounts((current) => ({ ...current, [methodId]: value }))
        }
        onNotesChange={setClosingNotes}
        onClose={() => setIsCloseModalOpen(false)}
        onSubmit={() => {
          void handleCloseSession();
        }}
      />
    </>
  );
}
