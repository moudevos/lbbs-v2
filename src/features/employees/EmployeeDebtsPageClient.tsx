"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/features/pos/pos-utils";
import { getDebtOriginSnapshot, getLoanInterestSnapshot } from "@/features/employees/loan-interest";

type Rel =
  | { name?: string; full_name?: string; settlement_number?: string }
  | null
  | Array<{ name?: string; full_name?: string; settlement_number?: string }>;
type Debt = {
  id: string;
  employee_id: string;
  branch_id: string;
  debt_type: string;
  original_amount: number;
  outstanding_amount: number;
  status: string;
  description: string;
  created_at: string;
  principal_amount?: number | null;
  interest_rate_percent?: number | null;
  interest_amount?: number | null;
  employee: Rel;
  branch: Rel;
};
type Movement = {
  id: string;
  debt_id: string;
  movement_type: string;
  amount: number;
  payment_reference: string | null;
  notes: string | null;
  created_at: string;
  payment_method: Rel;
  settlement: Rel;
};
type Data = {
  debts: Debt[];
  movements: Movement[];
  profiles?: Array<{ employee_id: string; branch_id: string; employee_name: string; branch_name: string; outstanding_total: number; active_debt_count: number; last_movement_date: string | null; last_movement_type: string | null; last_movement_signed_amount: number | null }>;
  filters: {
    employees: Array<{
      id: string;
      full_name: string;
      document_number: string | null;
      branch_id: string;
    }>;
    branches: Array<{ id: string; name: string }>;
    paymentMethods: Array<{ id: string; name: string; payment_kind: string }>;
  };
  permissions?: { canRecordPayments?: boolean; canCreatePenalty?: boolean; canWaiveDebts?: boolean };
};
type DebtProfile = {
  summary: {
    employee: Rel;
    branch: Rel;
    activeOutstandingTotal: number;
    activeDebtCount: number;
    originalActiveTotal: number;
    recoveredTotal: number;
    lastDebt: Debt | null;
    lastMovement: {
      event_date: string;
      event_type: string;
      description: string;
      reference: string | null;
      signed_amount: number;
    } | null;
  };
  debts: Debt[];
  ledger: Array<{
    debt_id: string;
    event_date: string;
    event_type: string;
    source_type: string;
    source_id: string;
    description: string;
    reference: string | null;
    signed_amount: number;
  }>;
  disbursements: Array<{
    id: string;
    debt_id: string;
    amount: number;
    payment_reference: string | null;
    notes: string | null;
    cash_context: "pos" | "external" | null;
    reconciliation_status: "reconciled" | "pending" | null;
    created_at: string;
    payment_method: Rel;
  }>;
};
type Disbursement = { paymentMethodId: string; amount: string; reference: string };
type FundingOrigin = "pos_cash" | "external_cash" | "wallet_qr" | "bank_transfer";
type PosWithdrawal = {
  id: string;
  pos_session_id: string;
  branch_id: string;
  created_at: string;
  description: string;
  amount: number;
  applied_amount: number;
  available_amount: number;
};
const rel = (value: Rel, key: "name" | "full_name" | "settlement_number") =>
  (Array.isArray(value) ? value[0] : value)?.[key] ?? "—";
const typeLabel: Record<string, string> = {
  loan: "Préstamo",
  advance: "Adelanto",
  supply: "Insumo",
  internal_credit: "Crédito POS",
  penalty: "Penalidad",
  administrative_charge: "Cargo administrativo",
  other: "Otro",
};
const stateLabel: Record<string, string> = {
  pending: "Pendiente",
  partial: "Parcial",
  paid: "Pagada",
  written_off: "Sin efecto",
  cancelled: "Anulada",
};
const movementLabel: Record<string, string> = {
  charge: "Cargo",
  immediate_payment: "Pago inmediato",
  settlement_deduction: "Descuento en liquidación",
  manual_payment: "Pago manual",
  adjustment: "Ajuste",
  write_off: "Sin efecto",
  cancellation: "Anulación",
};

function DebtOriginBreakdown({ debt }: { debt: Debt }) {
  const origin = getDebtOriginSnapshot({
    debtType: debt.debt_type,
    originalAmount: Number(debt.original_amount),
    principalAmount: debt.principal_amount,
    interestRatePercent: debt.interest_rate_percent,
    interestAmount: debt.interest_amount,
  });
  if (debt.debt_type !== "loan" || !origin.hasSnapshot) return null;
  return (
    <p className="text-xs text-slate-500">
      Capital {formatMoney(origin.principalAmount)} · Interés {origin.interestRatePercent}% ({formatMoney(origin.interestAmount)})
    </p>
  );
}

export function EmployeeDebtsPageClient() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [employeeId, setEmployeeId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [status, setStatus] = useState("open");
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"" | "create" | "payment" | "waive" | "profile">("");
  const [debt, setDebt] = useState<Debt | null>(null);
  const [selectedDebtProfile, setSelectedDebtProfile] = useState<{ employeeId: string; branchId: string } | null>(null);
  const [debtProfile, setDebtProfile] = useState<DebtProfile | null>(null);
  const [loadingDebtProfile, setLoadingDebtProfile] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({
    debtType: "loan",
  });
  const [disbursements, setDisbursements] = useState<Disbursement[]>([]);
  const [fundingOrigin, setFundingOrigin] = useState<FundingOrigin>("external_cash");
  const [posWithdrawals, setPosWithdrawals] = useState<PosWithdrawal[]>([]);
  const [selectedPosWithdrawalId, setSelectedPosWithdrawalId] = useState("");
  const [loadingPosWithdrawals, setLoadingPosWithdrawals] = useState(false);
  const [collectFullBalance, setCollectFullBalance] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ status });
      if (employeeId) p.set("employeeId", employeeId);
      if (branchId) p.set("branchId", branchId);
      const r = await fetch(`/api/admin/employee-debts?${p}`, {
        cache: "no-store",
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error);
      setData(body);
    } catch (error) {
      await Swal.fire({
        icon: "error",
        title: "No se pudo cargar deudas",
        text: error instanceof Error ? error.message : "Error inesperado",
        confirmButtonColor: "#0f766e",
      });
    } finally {
      setLoading(false);
    }
  }, [branchId, employeeId, status]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const debts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.debts ?? []).filter(
      (item) =>
        !term ||
        `${rel(item.employee, "full_name")} ${item.description} ${item.debt_type}`
          .toLowerCase()
          .includes(term),
    );
  }, [data?.debts, search]);
  const total = debts.reduce(
    (sum, item) => sum + Number(item.outstanding_amount),
    0,
  );
  const people = new Set(
    debts
      .filter((item) => ["pending", "partial"].includes(item.status))
      .map((item) => item.employee_id),
  ).size;
  const profiles = useMemo(() => (data?.profiles ?? []).filter((item) =>
    !search.trim() || `${item.employee_name} ${item.branch_name}`.toLowerCase().includes(search.trim().toLowerCase()),
  ), [data?.profiles, search]);
  const canRecordPayments = data?.permissions?.canRecordPayments !== false;
  const canCreatePenalty = data?.permissions?.canCreatePenalty !== false;
  const canWaiveDebts = data?.permissions?.canWaiveDebts !== false;
  const needsDisbursement = form.debtType === "loan" || form.debtType === "advance";
  const loanInterest = getLoanInterestSnapshot(form.debtType ?? "", Number(form.amount || 0), Number(form.interestRatePercent || 0));
  const selectedPosWithdrawal = posWithdrawals.find((item) => item.id === selectedPosWithdrawalId) ?? null;
  const isPosCash = needsDisbursement && fundingOrigin === "pos_cash";
  const disbursementTotal = disbursements.reduce(
    (sum, line) => sum + Number(line.amount || 0),
    0,
  );
  const disbursementMethods = disbursements.map((line) => line.paymentMethodId).filter(Boolean);
  const isValidDisbursement = (line: Disbursement) => {
    const method = data?.filters.paymentMethods.find((item) => item.id === line.paymentMethodId);
    return Boolean(
      method &&
        Number(line.amount) > 0 &&
        (["cash"].includes(method.payment_kind) || line.reference.trim()),
    );
  };
  const canSubmitDebt = Boolean(
    form.employeeId &&
      form.branchId &&
      form.debtType &&
      form.description?.trim() &&
      Number(form.amount) > 0 &&
      (form.debtType !== "loan" || loanInterest.interestRatePercent >= 0) &&
      (!needsDisbursement || (isPosCash
        ? Boolean(selectedPosWithdrawal && Number(form.amount) > 0 && Number(form.amount) <= selectedPosWithdrawal.available_amount)
        : (
        disbursements.length > 0 &&
        disbursements.every(isValidDisbursement) &&
        new Set(disbursementMethods).size === disbursements.length &&
        Math.round(disbursementTotal * 100) === Math.round(Number(form.amount) * 100)
        ))),
  );
  const set = (key: string, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  async function loadPosWithdrawals(nextBranchId: string) {
    if (!nextBranchId) {
      setPosWithdrawals([]);
      setSelectedPosWithdrawalId("");
      return;
    }
    setLoadingPosWithdrawals(true);
    try {
      const response = await fetch(`/api/admin/employee-debts/pos-withdrawals?branchId=${encodeURIComponent(nextBranchId)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudieron cargar las salidas POS.");
      setPosWithdrawals(payload.withdrawals ?? []);
      setSelectedPosWithdrawalId("");
    } catch (error) {
      setPosWithdrawals([]);
      setSelectedPosWithdrawalId("");
      await Swal.fire({ icon: "error", title: "No se pudieron cargar las salidas POS", text: error instanceof Error ? error.message : "Error inesperado" });
    } finally {
      setLoadingPosWithdrawals(false);
    }
  }
  const create = () => {
    const employee = data?.filters.employees.find(
      (item) => item.id === employeeId,
    );
    setForm({
      debtType: "loan",
      employeeId,
      branchId: branchId || employee?.branch_id || "",
      interestRatePercent: "0",
    });
    setDisbursements([{ paymentMethodId: "", amount: "", reference: "" }]);
    setFundingOrigin("external_cash");
    setPosWithdrawals([]);
    setSelectedPosWithdrawalId("");
    setDebt(null);
    setMode("create");
  };
  const pay = (item: Debt) => {
    if (!canRecordPayments) return;
    setDebt(item);
    setForm({ amount: String(item.outstanding_amount) });
    setCollectFullBalance(true);
    setMode("payment");
  };
  const waive = (item: Debt) => {
    if (!canWaiveDebts) return;
    setDebt(item);
    setForm({ reason: "" });
    setMode("waive");
  };
  async function openDebtProfile(employeeId: string, profileBranchId: string) {
    setSelectedDebtProfile({ employeeId, branchId: profileBranchId });
    setDebtProfile(null);
    setLoadingDebtProfile(true);
    setMode("profile");
    try {
      const query = new URLSearchParams({ employeeId, branchId: profileBranchId });
      const response = await fetch(`/api/admin/employee-debts/profile?${query}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo cargar el perfil.");
      setDebtProfile(payload);
    } catch (error) {
      await Swal.fire({ icon: "error", title: "No se pudo cargar el perfil", text: error instanceof Error ? error.message : "Error inesperado", confirmButtonColor: "#0f766e" });
      setMode("");
    } finally {
      setLoadingDebtProfile(false);
    }
  }
  async function submit() {
    if (mode === "create" && (form.debtType === "loan" || form.debtType === "advance")) {
      if (fundingOrigin === "pos_cash") {
        if (!selectedPosWithdrawal) {
          await Swal.fire({ icon: "warning", title: "Selecciona una salida POS", text: "El origen Efectivo POS requiere una salida física de efectivo." });
          return;
        }
        if (Number(form.amount) > selectedPosWithdrawal.available_amount) {
          await Swal.fire({ icon: "warning", title: "Monto no disponible", text: `Este movimiento solo tiene ${formatMoney(selectedPosWithdrawal.available_amount)} disponibles.` });
          return;
        }
      } else {
      const total = disbursements.reduce((sum, line) => sum + Number(line.amount || 0), 0);
      const methods = disbursements.map((line) => line.paymentMethodId);
      if (disbursements.some((line) => !line.paymentMethodId || Number(line.amount) <= 0)) {
        await Swal.fire({ icon: "warning", title: "Completa los desembolsos", text: "Cada línea necesita método y monto mayor a cero." });
        return;
      }
      if (disbursements.some((line) => !isValidDisbursement(line))) {
        await Swal.fire({ icon: "warning", title: "Referencia requerida", text: "Yape/Plin y transferencias necesitan una referencia." });
        return;
      }
      if (new Set(methods).size !== methods.length) {
        await Swal.fire({ icon: "warning", title: "Método repetido", text: "Consolida el monto de cada método en una sola línea." });
        return;
      }
      if (Math.round(total * 100) !== Math.round(Number(form.amount || 0) * 100)) {
        await Swal.fire({ icon: "warning", title: "Monto no conciliado", text: "La suma de desembolsos debe coincidir con la deuda." });
        return;
      }
      }
    }
    const payload =
      mode === "create"
        ? isPosCash
          ? {
              action: "createFromPosCash",
              ...form,
              cashMovementId: selectedPosWithdrawalId,
            }
          : {
            action: "create",
            ...form,
            disbursements:
              form.debtType === "loan" || form.debtType === "advance"
                ? disbursements.map((line) => ({ ...line, amount: Number(line.amount), cashContext: fundingOrigin === "external_cash" ? "external" : undefined }))
                : [],
          }
        : mode === "waive"
          ? { action: "waive", debtId: debt?.id, ...form }
          : { action: "payment", debtId: debt?.id, ...form };
    const r = await fetch("/api/admin/employee-debts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await r.json();
    if (!r.ok) {
      await Swal.fire({
        icon: "error",
        title: "No se pudo guardar",
        text: body.error,
        confirmButtonColor: "#0f766e",
      });
      return;
    }
    setMode("");
    await load();
    await Swal.fire({
      icon: "success",
      title: mode === "payment" ? "Pago registrado" : mode === "waive" ? "Deuda dejada sin efecto" : "Deuda registrada",
      timer: 1200,
      showConfirmButton: false,
    });
  }
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Cuenta corriente
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">
            Deudas de empleados
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Centraliza préstamos, adelantos, insumos y créditos originados en
            POS.
          </p>
        </div>
        <Button type="button" onClick={create}>
          Registrar deuda
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <article className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">Saldo pendiente</p>
          <p className="mt-1 text-2xl font-bold text-amber-950">
            {formatMoney(total)}
          </p>
        </article>
        <article className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
          <p className="text-sm text-sky-800">Empleados con saldo</p>
          <p className="mt-1 text-2xl font-bold text-sky-950">{people}</p>
        </article>
        <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm text-emerald-800">Deudas visibles</p>
          <p className="mt-1 text-2xl font-bold text-emerald-950">
            {debts.length}
          </p>
        </article>
      </div>
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-4">
          <Input
            placeholder="Buscar empleado o concepto"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
          >
            <option value="">Todas las sedes</option>
            {data?.filters.branches.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
          <Select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            <option value="">Todos los empleados</option>
            {data?.filters.employees.map((item) => (
              <option key={item.id} value={item.id}>
                {item.full_name}
              </option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="open">Pendientes y parciales</option>
            <option value="all">Todos los estados</option>
            <option value="paid">Pagadas</option>
            <option value="written_off">Sin efecto</option>
            <option value="cancelled">Anuladas</option>
          </Select>
        </div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4"><h2 className="font-semibold">Perfiles de deuda</h2><p className="text-sm text-slate-500">Saldo agrupado por empleado y sede. El perfil abre la cuenta corriente completa, sin depender del filtro de esta pantalla.</p></div>
        {loading ? <p className="text-sm text-slate-500">Cargando cuenta corriente...</p> : null}
        {!loading && profiles.length === 0 ? <p className="text-sm text-slate-500">No hay perfiles para los filtros seleccionados.</p> : null}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {profiles.map((profile) => <article key={`${profile.employee_id}:${profile.branch_id}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="font-semibold text-slate-950">{profile.employee_name}</p><p className="text-sm text-slate-500">{profile.branch_name}</p><p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Deuda pendiente</p><p className="text-2xl font-bold text-amber-800">{formatMoney(Number(profile.outstanding_total))}</p><p className="mt-2 text-sm text-slate-600">{profile.active_debt_count} deudas activas</p><p className="mt-3 text-xs text-slate-500">Último movimiento: {profile.last_movement_date ? new Date(profile.last_movement_date).toLocaleDateString("es-PE") : "—"} · {profile.last_movement_type ? movementLabel[profile.last_movement_type] ?? profile.last_movement_type : "Sin movimientos"}</p><Button type="button" className="mt-4 w-full" onClick={() => void openDebtProfile(profile.employee_id, profile.branch_id)}>Ver perfil de deuda</Button></article>)}
        </div>
      </section>
      <Modal
        open={mode === "create"}
        title="Registrar deuda"
        description="Los créditos POS y las entregas de insumos a crédito se crean automáticamente; aquí registra cargos manuales."
        onClose={() => setMode("")}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              className="bg-white text-slate-700"
              onClick={() => setMode("")}
            >
              Cancelar
            </Button>
            <Button type="button" disabled={!canSubmitDebt} onClick={() => void submit()}>
              Guardar deuda
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <label className="block text-sm font-medium">
            Empleado
            <Select
              value={form.employeeId ?? ""}
              onChange={(e) => {
                const employee = data?.filters.employees.find(
                  (item) => item.id === e.target.value,
                );
                const nextBranchId = employee?.branch_id ?? form.branchId ?? "";
                setForm((current) => ({
                  ...current,
                  employeeId: e.target.value,
                  branchId: nextBranchId,
                }));
                if (fundingOrigin === "pos_cash") void loadPosWithdrawals(nextBranchId);
              }}
            >
              <option value="">Seleccionar empleado</option>
              {data?.filters.employees.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.full_name}
                  {item.document_number ? ` · ${item.document_number}` : ""}
                </option>
              ))}
            </Select>
          </label>
          <label className="block text-sm font-medium">
            Sede
            <Select
              value={form.branchId ?? ""}
              onChange={(e) => {
                set("branchId", e.target.value);
                if (fundingOrigin === "pos_cash") void loadPosWithdrawals(e.target.value);
              }}
            >
              <option value="">Seleccionar sede</option>
              {data?.filters.branches.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="block text-sm font-medium">
            Tipo
            <Select
              value={form.debtType ?? "loan"}
              onChange={(e) => {
                set("debtType", e.target.value);
                if (e.target.value === "advance") set("interestRatePercent", "0");
              }}
            >
              <option value="loan">Préstamo</option>
              <option value="advance">Adelanto</option>
              {canCreatePenalty ? <option value="penalty">Penalidad</option> : null}
              {canCreatePenalty ? <option value="administrative_charge">Cargo administrativo</option> : null}
            </Select>
          </label>
          <label className="block text-sm font-medium">
            {form.debtType === "loan" ? "Capital entregado *" : form.debtType === "advance" ? "Monto del adelanto *" : "Monto *"}
            <Input className="mt-1" type="number" min="0.01" step="0.01" placeholder="0.00" value={form.amount ?? ""} onChange={(e) => set("amount", e.target.value)} />
          </label>
          {form.debtType === "loan" ? <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm sm:grid-cols-3">
            <label className="font-medium">Interés %<Input className="mt-1" type="number" min="0" step="0.0001" value={form.interestRatePercent ?? "0"} onChange={(e) => set("interestRatePercent", e.target.value)} /></label>
            <p className="self-end">Interés calculado<br /><strong>{formatMoney(loanInterest.interestAmount)}</strong></p>
            <p className="self-end">Deuda total<br /><strong>{formatMoney(loanInterest.totalDebt)}</strong></p>
          </div> : null}
          {form.debtType === "loan" || form.debtType === "advance" ? (
            <fieldset className="space-y-2 rounded-lg border border-slate-200 p-3">
              <legend className="px-1 text-sm font-semibold">Origen del desembolso</legend>
              <Select value={fundingOrigin} onChange={(event) => {
                const nextOrigin = event.target.value as FundingOrigin;
                setFundingOrigin(nextOrigin);
                setSelectedPosWithdrawalId("");
                if (nextOrigin === "pos_cash") void loadPosWithdrawals(form.branchId ?? "");
              }}>
                <option value="pos_cash">Efectivo POS</option>
                <option value="external_cash">Efectivo externo</option>
                <option value="wallet_qr">Yape / Plin</option>
                <option value="bank_transfer">Transferencia bancaria</option>
              </Select>
              {isPosCash ? (
                <div className="space-y-3">
                  <label className="block text-sm font-medium">Salida de efectivo POS
                    <Select className="mt-1" value={selectedPosWithdrawalId} disabled={loadingPosWithdrawals || !form.branchId} onChange={(event) => setSelectedPosWithdrawalId(event.target.value)}>
                      <option value="">{loadingPosWithdrawals ? "Cargando salidas…" : "Seleccionar salida"}</option>
                      {posWithdrawals.map((withdrawal) => <option key={withdrawal.id} value={withdrawal.id}>{new Date(withdrawal.created_at).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })} · {withdrawal.description} · Disponible {formatMoney(withdrawal.available_amount)}</option>)}
                    </Select>
                  </label>
                  {selectedPosWithdrawal ? <div className="grid gap-1 rounded-lg bg-slate-50 p-3 text-sm"><span>Salida POS registrada <strong>{formatMoney(selectedPosWithdrawal.amount)}</strong></span><span>Ya aplicada <strong>{formatMoney(selectedPosWithdrawal.applied_amount)}</strong></span><span>Disponible <strong>{formatMoney(selectedPosWithdrawal.available_amount)}</strong></span><span>Capital del {form.debtType === "advance" ? "adelanto" : "préstamo"} <strong>{formatMoney(loanInterest.principalAmount)}</strong></span>{form.debtType === "loan" ? <><span>Interés {loanInterest.interestRatePercent}% <strong>{formatMoney(loanInterest.interestAmount)}</strong></span><span>Deuda total <strong>{formatMoney(loanInterest.totalDebt)}</strong></span></> : null}<span>Saldo retiro después <strong>{formatMoney(Math.max(selectedPosWithdrawal.available_amount - loanInterest.principalAmount, 0))}</strong></span></div> : null}
                  {selectedPosWithdrawal && loanInterest.principalAmount > selectedPosWithdrawal.available_amount ? <p className="text-sm text-rose-700">Esta salida POS solo tiene {formatMoney(selectedPosWithdrawal.available_amount)} disponibles para entregar.</p> : null}
                </div>
              ) : <>
                {disbursements.map((line, index) => (
                  <div key={index} className="grid gap-2 sm:grid-cols-[1fr_130px_1fr_auto]">
                    <Select value={line.paymentMethodId} onChange={(event) => setDisbursements((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, paymentMethodId: event.target.value } : item))}>
                      <option value="">Seleccionar método</option>
                      {data?.filters.paymentMethods.filter((method) => fundingOrigin === "external_cash" ? method.payment_kind === "cash" : method.payment_kind === fundingOrigin).map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}
                    </Select>
                    <Input type="number" min="0.01" step="0.01" placeholder="Monto" value={line.amount} onChange={(event) => setDisbursements((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, amount: event.target.value } : item))} />
                    <Input placeholder="Referencia" value={line.reference} onChange={(event) => setDisbursements((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, reference: event.target.value } : item))} />
                    <Button type="button" className="bg-rose-50 text-rose-700 hover:bg-rose-100" disabled={disbursements.length === 1} onClick={() => setDisbursements((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Quitar</Button>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 text-sm"><Button type="button" className="bg-slate-100 text-slate-700 hover:bg-slate-200" onClick={() => setDisbursements((current) => [...current, { paymentMethodId: "", amount: "", reference: "" }])}>+ Agregar método</Button><span>Desembolsos: <strong>{formatMoney(disbursementTotal)}</strong> · Pendiente: <strong>{formatMoney(Math.max(0, Number(form.amount || 0) - disbursementTotal))}</strong></span></div>
                <p className="text-xs font-normal text-slate-500">El efectivo externo no toca la caja POS. Yape/Plin y transferencia mantienen su referencia obligatoria.</p>
              </>}
            </fieldset>
          ) : null}
          <Textarea
            placeholder="Motivo o descripción"
            value={form.description ?? ""}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>
      </Modal>
      <Modal
        open={mode === "waive"}
        title="Dejar deuda sin efecto"
        description={debt ? `No elimina el historial: anula el saldo pendiente de ${formatMoney(Number(debt.outstanding_amount))} y deja una auditoría.` : undefined}
        onClose={() => setMode("")}
        size="md"
        footer={<div className="flex justify-end gap-2"><Button type="button" className="bg-white text-slate-700" onClick={() => setMode("")}>Cancelar</Button><Button type="button" className="bg-rose-600 hover:bg-rose-700" onClick={() => void submit()}>Confirmar anulación</Button></div>}
      >
        <Textarea placeholder="Motivo obligatorio" value={form.reason ?? ""} onChange={(e) => set("reason", e.target.value)} />
      </Modal>
      <Modal
        open={mode === "payment"}
        title="Registrar pago"
        description={
          debt
            ? `${rel(debt.employee, "full_name")} · saldo ${formatMoney(Number(debt.outstanding_amount))}`
            : undefined
        }
        onClose={() => setMode("")}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              className="bg-white text-slate-700"
              onClick={() => setMode("")}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={() => void submit()}>
              Registrar pago
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={collectFullBalance}
              onChange={(event) => {
                setCollectFullBalance(event.target.checked);
                set("amount", event.target.checked ? String(debt?.outstanding_amount ?? "") : "");
              }}
            />
            Cobrar saldo total
          </label>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            placeholder="Monto pagado"
            value={form.amount ?? ""}
            onChange={(e) => set("amount", e.target.value)}
            disabled={collectFullBalance}
          />
          <Select
            value={form.paymentMethodId ?? ""}
            onChange={(e) => set("paymentMethodId", e.target.value)}
          >
            <option value="">Seleccionar método</option>
            {data?.filters.paymentMethods.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
          <Input
            placeholder="Referencia / operación (obligatoria para Yape/Plin o transferencia)"
            value={form.reference ?? ""}
            onChange={(e) => set("reference", e.target.value)}
          />
          <Textarea
            placeholder="Observación (opcional)"
            value={form.notes ?? ""}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>
      </Modal>
      <Modal
        open={mode === "profile"}
        title={`Perfil de deuda — ${debtProfile ? rel(debtProfile.summary.employee, "full_name") : "Empleado"}`}
        description={debtProfile ? `${rel(debtProfile.summary.branch, "name")} · cuenta corriente completa` : selectedDebtProfile ? "Consultando cuenta corriente completa..." : undefined}
        onClose={() => { setMode(""); setSelectedDebtProfile(null); setDebtProfile(null); }}
        size="xl"
      >
        {loadingDebtProfile || !debtProfile ? <p className="text-sm text-slate-500">Cargando perfil completo...</p> : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-4">
              <article className="rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-xs text-amber-800">Deuda activa</p><strong>{formatMoney(Number(debtProfile.summary.activeOutstandingTotal))}</strong></article>
              <article className="rounded-xl border border-sky-200 bg-sky-50 p-3"><p className="text-xs text-sky-800">Deudas activas</p><strong>{debtProfile.summary.activeDebtCount}</strong></article>
              <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><p className="text-xs text-emerald-800">Total recuperado</p><strong>{formatMoney(Number(debtProfile.summary.recoveredTotal))}</strong></article>
              <article className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs text-slate-600">Última deuda</p><strong className="text-sm">{debtProfile.summary.lastDebt?.description ?? "—"}</strong></article>
            </div>
            <section><h3 className="font-semibold">Deudas activas</h3><div className="mt-2 space-y-2">{debtProfile.debts.filter((item) => ["pending", "partial"].includes(item.status)).map((item) => <article key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3"><div><p className="font-medium">{typeLabel[item.debt_type] ?? item.debt_type} · {item.description}</p><DebtOriginBreakdown debt={item} /><p className="text-xs text-slate-500">Original {formatMoney(Number(item.original_amount))} · {stateLabel[item.status] ?? item.status} · {new Date(item.created_at).toLocaleDateString("es-PE")}</p></div><div className="flex items-center gap-2"><strong>Saldo {formatMoney(Number(item.outstanding_amount))}</strong>{canRecordPayments ? <Button type="button" className="h-8 px-2 text-xs" onClick={() => pay(item)}>Cobrar</Button> : null}{canWaiveDebts && item.debt_type === "penalty" ? <Button type="button" className="h-8 bg-rose-100 px-2 text-xs text-rose-700 hover:bg-rose-200" onClick={() => waive(item)}>Sin efecto</Button> : null}</div></article>)}{debtProfile.debts.every((item) => !["pending", "partial"].includes(item.status)) ? <p className="text-sm text-slate-500">No hay deudas activas.</p> : null}</div></section>
            <section><h3 className="font-semibold">Historial de movimientos</h3><div className="mt-2 space-y-2">{debtProfile.ledger.map((event) => { const amount = Number(event.signed_amount); return <article key={`${event.source_type}:${event.source_id}`} className="flex justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3"><div><p className="font-medium">{event.event_type === "penalty" ? "Penalidad" : movementLabel[event.event_type] ?? typeLabel[event.event_type] ?? event.event_type}</p><p className="text-sm text-slate-600">{event.description}</p><p className="text-xs text-slate-500">{new Date(event.event_date).toLocaleString("es-PE")} · {event.source_type}{event.reference ? ` · Ref. ${event.reference}` : ""}</p></div><strong className={amount < 0 ? "text-emerald-700" : "text-amber-700"}>{amount < 0 ? "−" : "+"}{formatMoney(Math.abs(amount))}</strong></article>})}</div></section>
            <section><h3 className="font-semibold">Desembolsos</h3><div className="mt-2 space-y-2">{debtProfile.disbursements.length ? debtProfile.disbursements.map((item) => <article key={item.id} className="flex justify-between gap-3 rounded-xl border border-slate-200 p-3"><div><p className="font-medium">{rel(item.payment_method, "name")}</p><p className="text-xs text-slate-500">{new Date(item.created_at).toLocaleString("es-PE")}{item.payment_reference ? ` · Ref. ${item.payment_reference}` : ""}{item.notes ? ` · ${item.notes}` : ""}</p>{item.cash_context ? <p className={item.reconciliation_status === "pending" ? "mt-1 text-xs font-medium text-amber-700" : "mt-1 text-xs font-medium text-emerald-700"}>{item.cash_context === "pos" ? "Caja POS" : "Fuera de caja POS"} · {item.reconciliation_status === "pending" ? "Pendiente de conciliación" : "Conciliado"}</p> : null}</div><strong>{formatMoney(Number(item.amount))}</strong></article>) : <p className="text-sm text-slate-500">Sin desembolsos registrados.</p>}</div></section>
            <section><h3 className="font-semibold">Historial cerrado</h3><div className="mt-2 space-y-2">{debtProfile.debts.filter((item) => !["pending", "partial"].includes(item.status)).map((item) => <article key={item.id} className="rounded-xl border border-slate-200 p-3 text-sm"><strong>{typeLabel[item.debt_type] ?? item.debt_type}</strong> · {item.description}<DebtOriginBreakdown debt={item} /><p className="mt-1">Original {formatMoney(Number(item.original_amount))} · {stateLabel[item.status] ?? item.status} · saldo {formatMoney(Number(item.outstanding_amount))}</p></article>)}</div></section>
          </div>
        )}
      </Modal>
    </section>
  );
}
