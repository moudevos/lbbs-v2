"use client";

import { useState } from "react";
import { faUserShield } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/Modal";
import { verifyPosInternalAuthorizationPin } from "@/features/pos/pos-actions";
import type { PosInternalBenefitRule, PosInternalCustomerOptions } from "@/features/pos/pos-types";
import { formatMoney } from "@/features/pos/pos-utils";

type Props = {
  open: boolean;
  options: PosInternalCustomerOptions;
  selectedRuleId: string;
  internalCredit: boolean;
  authorizationPin: string;
  branchId: string;
  onlyProducts: boolean;
  onRuleChange: (value: string) => void;
  onCreditChange: (value: boolean) => void;
  onAuthorizationPinChange: (value: string) => void;
  onClose: () => void;
};

export function PosInternalOperationModal({
  open,
  options,
  selectedRuleId,
  internalCredit,
  authorizationPin,
  branchId,
  onlyProducts,
  onRuleChange,
  onCreditChange,
  onAuthorizationPinChange,
  onClose,
}: Props) {
  const employee = options.employee;
  const [pendingAuthorizationRuleId, setPendingAuthorizationRuleId] = useState("");
  const [authorizationError, setAuthorizationError] = useState("");
  const [isVerifyingAuthorization, setIsVerifyingAuthorization] = useState(false);

  if (!employee) return null;

  const pendingAuthorizationRule = options.rules.find(
    (rule) => rule.id === pendingAuthorizationRuleId,
  ) ?? null;
  const selectedRule = options.rules.find((rule) => rule.id === selectedRuleId) ?? null;
  const canSendBenefitBalanceToCredit = Boolean(
    options.canUseCredit && selectedRule && !selectedRule.is_internal_complimentary,
  );

  async function confirmAuthorization() {
    if (!pendingAuthorizationRule) return;
    if (!/^\d{6,12}$/.test(authorizationPin)) {
      setAuthorizationError("Ingresa un PIN de autorización de 6 a 12 dígitos.");
      return;
    }

    setAuthorizationError("");
    setIsVerifyingAuthorization(true);
    try {
      await verifyPosInternalAuthorizationPin(authorizationPin, branchId);
      onRuleChange(pendingAuthorizationRule.id);
      onCreditChange(false);
      setPendingAuthorizationRuleId("");
      onClose();
    } catch (error) {
      setAuthorizationError(
        error instanceof Error ? error.message : "No se pudo verificar el PIN de autorización.",
      );
    } finally {
      setIsVerifyingAuthorization(false);
    }
  }

  function chooseRule(rule: PosInternalBenefitRule) {
    onCreditChange(false);
    if (rule.requires_owner_authorization || rule.is_internal_complimentary) {
      onRuleChange("");
      onAuthorizationPinChange("");
      setAuthorizationError("");
      setPendingAuthorizationRuleId(rule.id);
      return;
    }

    onRuleChange(rule.id);
    onClose();
  }

  function handleClose() {
    setPendingAuthorizationRuleId("");
    setAuthorizationError("");
    onClose();
  }

  return (
    <Modal
      open={open}
      title="Operación interna"
      description={`Cliente vinculado: ${employee.fullName}. Puedes aplicar un beneficio y registrar su saldo restante como crédito.`}
      onClose={handleClose}
      size="lg"
    >
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => {
            onRuleChange("");
            onCreditChange(false);
            setPendingAuthorizationRuleId("");
            handleClose();
          }}
          className={[
            "w-full rounded-xl border p-4 text-left",
            !selectedRuleId && !internalCredit
              ? "border-violet-300 bg-violet-50"
              : "border-slate-200 hover:border-violet-200",
          ].join(" ")}
        >
          <p className="font-semibold text-slate-900">Venta normal interna</p>
          <p className="mt-1 text-sm text-slate-600">No aplica reward, beneficio ni crédito.</p>
        </button>

        {options.rules.map((rule) => {
          const isSelected = selectedRuleId === rule.id || pendingAuthorizationRuleId === rule.id;
          return (
            <button
              key={rule.id}
              type="button"
              onClick={() => chooseRule(rule)}
              className={[
                "w-full rounded-xl border p-4 text-left",
                isSelected ? "border-violet-300 bg-violet-50" : "border-slate-200 hover:border-violet-200",
              ].join(" ")}
            >
              <div className="flex justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{rule.name}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {rule.benefit_type === "free"
                      ? "Gratis"
                      : rule.benefit_type === "fixed_price"
                        ? `Precio fijo: ${formatMoney(Number(rule.benefit_value))}`
                        : `Descuento: ${rule.benefit_value}%`}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {rule.production_mode === "percentage"
                      ? "Se liquidará por porcentaje."
                      : rule.production_mode === "none"
                        ? "No genera liquidación."
                        : `Pago fijo al ejecutor: ${formatMoney(Number(rule.fixed_barber_payout))}`}
                  </p>
                </div>
                {isSelected ? <FontAwesomeIcon icon={faUserShield} className="text-violet-700" /> : null}
              </div>
            </button>
          );
        })}

        {(options.canUseCredit && onlyProducts) || canSendBenefitBalanceToCredit ? (
          <button
            type="button"
            onClick={() => {
              if (!canSendBenefitBalanceToCredit) onRuleChange("");
              onCreditChange(true);
              setPendingAuthorizationRuleId("");
              handleClose();
            }}
            className={[
              "w-full rounded-xl border p-4 text-left",
              internalCredit ? "border-amber-300 bg-amber-50" : "border-slate-200 hover:border-amber-200",
            ].join(" ")}
          >
            <p className="font-semibold text-slate-900">{canSendBenefitBalanceToCredit ? "Enviar saldo del beneficio a crédito" : "Crédito de empleado"}</p>
            <p className="mt-1 text-sm text-slate-600">
              {canSendBenefitBalanceToCredit
                ? "Aplica el beneficio y crea una deuda solo por el saldo final. No ingresa dinero a caja."
                : "Solo productos. Crea una deuda para descontar en liquidación; no ingresa dinero a caja."}
            </p>
          </button>
        ) : null}

        {pendingAuthorizationRule ? (
          <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-semibold text-amber-900">Confirmar autorización del owner</p>
            <p className="text-xs text-amber-800">
              El beneficio se aplicará solo después de validar el PIN. El checkout lo comprobará una segunda vez por seguridad.
            </p>
            <Input
              type="password"
              inputMode="numeric"
              maxLength={12}
              value={authorizationPin}
              onChange={(event) => onAuthorizationPinChange(event.target.value.replace(/\D/g, ""))}
              placeholder="PIN de autorización (6 a 12 dígitos)"
            />
            {authorizationError ? <p role="alert" className="text-xs font-medium text-rose-700">{authorizationError}</p> : null}
            <Button type="button" className="w-full" disabled={isVerifyingAuthorization} onClick={() => void confirmAuthorization()}>
              {isVerifyingAuthorization ? "Verificando PIN..." : "Validar y aplicar beneficio"}
            </Button>
          </div>
        ) : null}

        <Button type="button" className="w-full bg-slate-700 hover:bg-slate-600" onClick={handleClose}>
          Cerrar
        </Button>
      </div>
    </Modal>
  );
}
