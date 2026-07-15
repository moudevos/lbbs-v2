"use client";

import { useState } from "react";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Swal from "sweetalert2";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { PosPaymentMethodRecord, PosPreparedPayment } from "@/features/pos/pos-types";

type PosPaymentPanelProps = {
  paymentMethods: PosPaymentMethodRecord[];
  pendingBalance: number;
  onAddPayment: (payment: PosPreparedPayment) => void;
};

export function PosPaymentPanel({
  paymentMethods,
  pendingBalance,
  onAddPayment,
}: PosPaymentPanelProps) {
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [amount, setAmount] = useState("");

  async function handleAddPayment() {
    const numericAmount = Number(amount);
    const method = paymentMethods.find((item) => item.id === paymentMethodId);
    if (!method || !Number.isFinite(numericAmount) || numericAmount <= 0 || pendingBalance <= 0) return;
    const allowsChange = method.allows_change;
    const appliedAmount = allowsChange ? Math.min(numericAmount, pendingBalance) : numericAmount;
    const changeAmount = allowsChange ? Math.max(numericAmount - appliedAmount, 0) : 0;
    if (!allowsChange && numericAmount > pendingBalance) {
      await Swal.fire({ icon: "warning", title: "Monto invalido", text: "Este metodo de pago no permite exceder el saldo pendiente.", confirmButtonColor: "#0f766e" });
      return;
    }
    onAddPayment({ id: crypto.randomUUID(), payment_method_id: method.id, payment_method_code: method.code, payment_method_name: method.name, amount: appliedAmount, tendered_amount: allowsChange ? numericAmount : appliedAmount, change_amount: changeAmount, allows_change: allowsChange });
    setAmount("");
    setPaymentMethodId("");
  }

  return (
    <form className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_auto]" onSubmit={(event) => { event.preventDefault(); void handleAddPayment(); }}>
      <Select value={paymentMethodId} onChange={(event) => setPaymentMethodId(event.target.value)}>
        <option value="">Metodo</option>
        {paymentMethods.map((method) => (
          <option key={method.id} value={method.id}>
            {method.name}
          </option>
        ))}
      </Select>

      <Input
        type="number"
        min="0"
        step="0.01"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        placeholder="Monto"
        className="h-10"
      />

      <Button
        type="submit"
        className="h-10 px-3"
        disabled={!paymentMethodId || pendingBalance <= 0}
      >
        <FontAwesomeIcon icon={faPlus} />
      </Button>
    </form>
  );
}
