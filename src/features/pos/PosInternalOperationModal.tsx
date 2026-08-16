"use client";

import { faUserShield } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/Modal";
import type { PosInternalBenefitRule, PosInternalCustomerOptions } from "@/features/pos/pos-types";
import { formatMoney } from "@/features/pos/pos-utils";

type Props = {
  open: boolean;
  options: PosInternalCustomerOptions;
  selectedRule: PosInternalBenefitRule | null;
  selectedRuleId: string;
  internalCredit: boolean;
  authorizationReason: string;
  authorizationPin: string;
  onlyProducts: boolean;
  onRuleChange: (value: string) => void;
  onCreditChange: (value: boolean) => void;
  onAuthorizationReasonChange: (value: string) => void;
  onAuthorizationPinChange: (value: string) => void;
  onClose: () => void;
};

export function PosInternalOperationModal({ open, options, selectedRule, selectedRuleId, internalCredit, authorizationReason, authorizationPin, onlyProducts, onRuleChange, onCreditChange, onAuthorizationReasonChange, onAuthorizationPinChange, onClose }: Props) {
  const employee = options.employee;
  if (!employee) return null;

  return <Modal open={open} title="Operación interna" description={`Cliente vinculado: ${employee.fullName}. Elige una sola modalidad para esta venta.`} onClose={onClose} size="lg">
    <div className="space-y-3">
      <button type="button" onClick={() => { onRuleChange(""); onCreditChange(false); onClose(); }} className={["w-full rounded-xl border p-4 text-left", !selectedRuleId && !internalCredit ? "border-violet-300 bg-violet-50" : "border-slate-200 hover:border-violet-200"].join(" ")}><p className="font-semibold text-slate-900">Venta normal interna</p><p className="mt-1 text-sm text-slate-600">No aplica reward, beneficio ni crédito.</p></button>
      {options.rules.map((rule) => <button key={rule.id} type="button" onClick={() => { onRuleChange(rule.id); onCreditChange(false); if (!rule.is_internal_complimentary) onClose(); }} className={["w-full rounded-xl border p-4 text-left", selectedRuleId === rule.id ? "border-violet-300 bg-violet-50" : "border-slate-200 hover:border-violet-200"].join(" ")}><div className="flex justify-between gap-3"><div><p className="font-semibold text-slate-900">{rule.name}</p><p className="mt-1 text-sm text-slate-600">{rule.benefit_type === "free" ? "Gratis" : rule.benefit_type === "fixed_price" ? `Precio fijo: ${formatMoney(Number(rule.benefit_value))}` : `Descuento: ${rule.benefit_value}%`}</p><p className="mt-1 text-xs text-slate-500">{rule.production_mode === "percentage" ? "Se liquidará por porcentaje." : rule.production_mode === "none" ? "No genera liquidación." : `Pago fijo al ejecutor: ${formatMoney(Number(rule.fixed_barber_payout))}`}</p></div>{selectedRuleId === rule.id ? <FontAwesomeIcon icon={faUserShield} className="text-violet-700" /> : null}</div></button>)}
      {options.canUseCredit && onlyProducts ? <button type="button" onClick={() => { onRuleChange(""); onCreditChange(true); onClose(); }} className={["w-full rounded-xl border p-4 text-left", internalCredit ? "border-amber-300 bg-amber-50" : "border-slate-200 hover:border-amber-200"].join(" ")}><p className="font-semibold text-slate-900">Crédito de empleado</p><p className="mt-1 text-sm text-slate-600">Solo productos. Crea una deuda para descontar en liquidación; no ingresa dinero a caja.</p></button> : null}
      {selectedRule?.is_internal_complimentary ? <div className="space-y-2 rounded-xl bg-amber-50 p-3"><p className="text-sm font-semibold text-amber-900">Autorización del owner</p><Input value={authorizationReason} onChange={(event) => onAuthorizationReasonChange(event.target.value)} placeholder="Motivo obligatorio del consumo sin cobro" /><Input type="password" inputMode="numeric" maxLength={12} value={authorizationPin} onChange={(event) => onAuthorizationPinChange(event.target.value.replace(/\D/g, ""))} placeholder="PIN de autorización (6 a 12 dígitos)" /></div> : null}
      <Button type="button" className="w-full bg-slate-700 hover:bg-slate-600" onClick={onClose}>Cerrar</Button>
    </div>
  </Modal>;
}
