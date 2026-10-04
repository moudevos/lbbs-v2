"use client";

import { useMemo, useState } from "react";
import Swal from "sweetalert2";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/features/pos/pos-utils";
import { getPosCashFlowPreview, type PosCashMovementType } from "@/features/pos/pos-cash-flow";

type MovementType = PosCashMovementType;
type Props = {
  open: boolean;
  expectedCash: number;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (input: { movementType: MovementType; amount: number; description: string; evidenceUrl: string | null }) => Promise<void>;
};

export function PosCashFlowModal({ open, expectedCash, isSubmitting, onClose, onSubmit }: Props) {
  const [movementType, setMovementType] = useState<MovementType>("income");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const preview = useMemo(() => getPosCashFlowPreview(expectedCash, movementType, Number(amount)), [amount, expectedCash, movementType]);
  const numericAmount = preview.amount;
  const insufficientCash = preview.insufficientCash;
  const afterCash = preview.afterCash;
  const valid = numericAmount > 0 && description.trim().length > 0 && !insufficientCash;

  function resetForm() {
    setMovementType("income");
    setAmount("");
    setDescription("");
    setEvidenceUrl("");
  }

  async function submit() {
    if (!valid || isSubmitting) return;
    const confirmationText = movementType === "income"
      ? "Se agregará " + formatMoney(numericAmount) + " a la caja actual."
      : "Se retirarán " + formatMoney(numericAmount) + " de la caja actual. El efectivo esperado quedará en " + formatMoney(afterCash) + ".";
    const confirmation = await Swal.fire({
      icon: "warning",
      title: movementType === "income" ? "¿Registrar ingreso de efectivo?" : "¿Registrar salida de efectivo?",
      text: confirmationText,
      showCancelButton: true,
      confirmButtonText: movementType === "income" ? "Registrar ingreso" : "Registrar salida",
      cancelButtonText: "Cancelar",
      focusCancel: true,
      reverseButtons: true,
    });
    if (confirmation.isConfirmed !== true) return;

    try {
      await onSubmit({ movementType, amount: numericAmount, description: description.trim(), evidenceUrl: evidenceUrl.trim() || null });
      resetForm();
      onClose();
      await Swal.fire({ icon: "success", title: "Flujo registrado", text: "El efectivo esperado de la sesión fue actualizado." });
    } catch (error) {
      await Swal.fire({ icon: "error", title: "No se pudo registrar el flujo de efectivo", text: error instanceof Error ? error.message : "Error inesperado" });
    }
  }

  return <Modal open={open} title="Flujo de efectivo" description={movementType === "expense" ? "Registra dinero que sale físicamente de la caja actual." : "Registra dinero que entra físicamente a la caja actual."} onClose={onClose} closeOnEscape={!isSubmitting} closeOnOutsideClick={!isSubmitting} confirmBeforeClose={false} size="md" footer={<div className="flex justify-end gap-2"><Button className="border border-slate-200 bg-white text-slate-700" disabled={isSubmitting} onClick={onClose}>Cancelar</Button><Button disabled={!valid || isSubmitting} onClick={() => void submit()}>{isSubmitting ? "Registrando…" : "Registrar flujo"}</Button></div>}>
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2"><Button className={movementType === "income" ? "" : "border border-slate-200 bg-white text-slate-700"} disabled={isSubmitting} onClick={() => setMovementType("income")}>Ingreso</Button><Button className={movementType === "expense" ? "bg-rose-600 hover:bg-rose-700" : "border border-slate-200 bg-white text-slate-700"} disabled={isSubmitting} onClick={() => setMovementType("expense")}>Salida</Button></div>
      <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm"><div className="flex justify-between"><span>Efectivo esperado actual</span><strong>{formatMoney(expectedCash)}</strong></div><div className="flex justify-between"><span>{movementType === "income" ? "Ingreso de efectivo" : "Salida de efectivo"}</span><strong className={movementType === "income" ? "text-emerald-700" : "text-rose-700"}>{movementType === "income" ? "+" : "-"}{formatMoney(numericAmount)}</strong></div><div className="flex justify-between border-t border-slate-200 pt-2"><span>Efectivo esperado después</span><strong>{formatMoney(afterCash)}</strong></div></div>
      <label className="block text-sm font-medium">Monto *<Input className="mt-1" type="number" min="0.01" step="0.01" value={amount} disabled={isSubmitting} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /></label>
      {insufficientCash ? <p className="text-sm text-rose-700">El efectivo disponible en la caja es {formatMoney(expectedCash)}. No puedes registrar una salida mayor.</p> : null}
      <label className="block text-sm font-medium">Descripción *<Textarea className="mt-1" value={description} disabled={isSubmitting} onChange={(event) => setDescription(event.target.value)} /></label>
      <label className="block text-sm font-medium">Evidencia URL <span className="font-normal text-slate-500">(opcional)</span><Input className="mt-1" type="url" value={evidenceUrl} disabled={isSubmitting} onChange={(event) => setEvidenceUrl(event.target.value)} placeholder="https://…" /></label>
    </div>
  </Modal>;
}
