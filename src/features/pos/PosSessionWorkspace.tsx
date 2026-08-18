"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";

import { Button } from "@/components/ui/button";
import {
  cancelCompletedPosSale,
  checkoutPosSale,
  closePosSession,
  fetchPosSessionCloseSummary,
  fetchRecentPosSales,
} from "@/features/pos/pos-actions";
import { PosCart } from "@/features/pos/PosCart";
import { PosCatalog } from "@/features/pos/PosCatalog";
import { PosSaleCancelModal } from "@/features/pos/PosSaleCancelModal";
import { PosSaleSuccessModal } from "@/features/pos/PosSaleSuccessModal";
import { PosSessionCloseModal } from "@/features/pos/PosSessionCloseModal";
import { PosReservationsModal } from "@/features/pos/PosReservationsModal";
import type {
  PosCheckoutResult,
  PosRecentSaleRecord,
  PosSessionCloseSummary,
} from "@/features/pos/pos-types";
import { usePosWorkspace } from "@/features/pos/usePosWorkspace";
import {
  getRewardDiscountPreview,
  reconcilePosPayments,
} from "@/features/pos/pos-utils";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faBuilding,
  faCalendarDays,
  faClock,
  faPowerOff,
  faReceipt,
  faUser,
} from "@fortawesome/free-solid-svg-icons";

import { PosLoadingScreen } from "@/features/pos/PosLoadingScreen";
import {
  enqueuePosCheckout,
  listPendingPosCheckouts,
  removePendingPosCheckout,
} from "@/features/pos/pos-offline-queue";
import type { PosCheckoutPayload } from "@/features/pos/pos-types";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Lima",
  }).format(new Date(value));
}

export function PosSessionWorkspace() {
  const {
    activeSession,
    activeReservationId,
    availableRewards,
    barberRequired,
    bootstrap,
    cartItems,
    catalogSearch,
    categoryFilter,
    courtesyTotal,
    customerVarious,
    customerVariousId,
    discountTotal,
    employees,
    isLoading,
    isLoadingCatalog,
    isLoadingRewards,
    internalAuthorizationPin,
    internalBenefitDiscount,
    internalCredit,
    internalCustomerOptions,
    internalOptionsError,
    loadBootstrap,
    loadCatalog,
    paymentMethods,
    payments,
    checkoutIdempotencyKey,
    productCategories,
    selectedBarberId,
    selectedBranchId,
    selectedCustomer,
    selectedReward,
    selectedInternalBenefit,
    selectedInternalBenefitRuleId,
    selectedRewardEntitlementId,
    serviceCategories,
    subtotal,
    total,
    visibleProducts,
    visibleServices,
    addProduct,
    addService,
    changeItemQuantity,
    clearCurrentDraft,
    searchPosCustomers,
    setCartItems,
    setCatalogSearch,
    setCategoryFilter,
    setPayments,
    setCheckoutIdempotencyKey,
    setSelectedBarberId,
    setSelectedCustomer,
    setSelectedRewardEntitlementId,
    setSelectedInternalBenefitRuleId,
    setInternalAuthorizationPin,
    setInternalCredit,
    setSelectedReservationId,
  } = usePosWorkspace();

  const [isClosingSale, setIsClosingSale] = useState(false);
  const [closedSale, setClosedSale] = useState<PosCheckoutResult | null>(null);
  const [isCloseSessionModalOpen, setIsCloseSessionModalOpen] = useState(false);
  const [closeSessionSummary, setCloseSessionSummary] = useState<PosSessionCloseSummary | null>(
    null,
  );
  const [countedAmounts, setCountedAmounts] = useState<Record<string, string>>({});
  const [closingNotes, setClosingNotes] = useState("");
  const [isLoadingCloseSummary, setIsLoadingCloseSummary] = useState(false);
  const [isClosingSession, setIsClosingSession] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [recentSales, setRecentSales] = useState<PosRecentSaleRecord[]>([]);
  const [isLoadingRecentSales, setIsLoadingRecentSales] = useState(false);
  const [isCancellingSale, setIsCancellingSale] = useState(false);
  const [isReservationsOpen, setIsReservationsOpen] = useState(false);
  const [reservationSuggestion, setReservationSuggestion] = useState<string | null>(null);
  const [pendingOfflineCount, setPendingOfflineCount] = useState(0);

  const rewardDiscount = useMemo(
    () => getRewardDiscountPreview(cartItems, selectedReward),
    [cartItems, selectedReward],
  );
  const checkoutTotal = Math.max(total - rewardDiscount - internalBenefitDiscount, 0);
  const paymentReconciliation = useMemo(
    () => reconcilePosPayments(checkoutTotal, payments),
    [checkoutTotal, payments],
  );
  const pendingBalance = paymentReconciliation.pendingBalance;
  const changeAmount = paymentReconciliation.changeAmount;
  const canCheckout =
    cartItems.length > 0 &&
    Boolean(selectedCustomer) &&
    (!barberRequired || Boolean(selectedBarberId)) &&
    checkoutTotal >= 0 &&
    (internalCredit || pendingBalance === 0) &&
    !paymentReconciliation.requiresAdjustment;

  useEffect(() => {
    const current = JSON.stringify(payments);
    const reconciled = JSON.stringify(paymentReconciliation.payments);
    if (current === reconciled) return;
    const timer = window.setTimeout(() => setPayments(paymentReconciliation.payments), 0);
    return () => window.clearTimeout(timer);
  }, [paymentReconciliation.payments, payments, setPayments]);

  useEffect(() => {
    async function refreshQueue() {
      const pending = await listPendingPosCheckouts();
      setPendingOfflineCount(pending.length);
    }
    void refreshQueue();

    async function synchronize() {
      const pending = await listPendingPosCheckouts();
      for (const entry of pending.sort((left, right) => left.createdAt.localeCompare(right.createdAt))) {
        try {
          await checkoutPosSale(entry.payload);
          await removePendingPosCheckout(entry.id);
        } catch {
          // La validación del servidor decide cuándo una operación debe revisarse.
          break;
        }
      }
      await refreshQueue();
    }
    window.addEventListener("online", synchronize);
    return () => window.removeEventListener("online", synchronize);
  }, []);

  async function handleRewardChange(nextRewardId: string) {
    if (payments.length > 0 && nextRewardId !== selectedRewardEntitlementId) {
      const result = await Swal.fire({
        icon: "info",
        title: "Recalcular pagos",
        text: "El reward modificara el total y los pagos seran recalculados.",
        showCancelButton: true,
        confirmButtonText: "Continuar",
        cancelButtonText: "Cancelar",
        confirmButtonColor: "#0f766e",
      });
      if (!result.isConfirmed) return;
    }
    setSelectedRewardEntitlementId(nextRewardId);
  }

  if (isLoading || !bootstrap) {
    return (
      <div className="flex h-screen items-center justify-center overflow-hidden bg-slate-50">
        <section className="w-full max-w-xl rounded-[1.75rem] border border-slate-200 bg-white p-8 shadow-sm">
          <PosLoadingScreen label="Cargando POS..." storageKey="bootstrap" fallbackMs={1800} />
        </section>
      </div>
    );
  }

  if (!activeSession) {
    const shouldSelectSessionFromPanel =
      bootstrap.role !== "reception" && !bootstrap.employee?.branch_id;

    return (
      <div className="flex h-screen items-center justify-center overflow-hidden bg-slate-50 px-4">
        <section className="w-full max-w-xl rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="space-y-4">
            <div className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
              Sesion requerida
            </div>

            <div>
              <p className="text-xl font-semibold text-slate-900">No hay sesion POS abierta</p>
              <p className="mt-2 text-sm text-slate-600">
                {shouldSelectSessionFromPanel
                  ? "Selecciona una sesion POS desde el panel."
                  : "Abre o recupera la sesion desde el panel antes de ingresar a la caja."}
              </p>
            </div>

            <Link
              href="/control/pos"
              className="inline-flex h-11 w-full items-center justify-center rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-white sm:w-auto"
            >
              Volver al panel
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const currentSession = activeSession;

  async function handleOpenCloseSessionModal() {
    if (pendingOfflineCount > 0) {
      await Swal.fire({
        icon: "warning",
        title: "Hay ventas pendientes de sincronización",
        text: "Reconecta este dispositivo y espera la sincronización antes de cerrar la sesión POS.",
        confirmButtonColor: "#0f766e",
      });
      return;
    }
    setIsCloseSessionModalOpen(true);
    setIsLoadingCloseSummary(true);

    try {
      const summary = await fetchPosSessionCloseSummary(currentSession.id);
      setCloseSessionSummary(summary);
      setCountedAmounts(
        Object.fromEntries(summary.paymentMethods.map((method) => [method.paymentMethodId, "0"])),
      );
      setClosingNotes(summary.closingNotes ?? "");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[pos/ui] Error al cargar cierre de sesion", {
        message,
        sessionId: currentSession.id,
      });
      await Swal.fire({
        icon: "error",
        title: "No se pudo cargar el cierre de sesion",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      setIsCloseSessionModalOpen(false);
    } finally {
      setIsLoadingCloseSummary(false);
    }
  }

  async function handleCloseSession() {
    const result = await Swal.fire({
      icon: "question",
      title: "Cerrar sesion POS",
      text: "Se cerrara la caja con el efectivo contado actual.",
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
      await closePosSession(currentSession.id, {
        counted_amounts: countedAmounts,
        notes: closingNotes,
      });
      clearCurrentDraft();
      await loadBootstrap(selectedBranchId);
      setIsCloseSessionModalOpen(false);
      setCloseSessionSummary(null);
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
        sessionId: currentSession.id,
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

  async function handleOpenRecentSalesModal() {
    setIsCancelModalOpen(true);
    setIsLoadingRecentSales(true);

    try {
      const data = await fetchRecentPosSales(currentSession.id);
      setRecentSales(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[pos/ui] Error al cargar ventas recientes", {
        message,
        sessionId: currentSession.id,
      });
      await Swal.fire({
        icon: "error",
        title: "No se pudieron cargar las ventas recientes",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      setIsCancelModalOpen(false);
    } finally {
      setIsLoadingRecentSales(false);
    }
  }

  async function handleCancelSale(saleId: string, reasonId: string, notes: string) {
    const result = await Swal.fire({
      icon: "warning",
      title: "Anular venta completada",
      text: "La anulacion revertira el stock descontado y actualizara la caja.",
      showCancelButton: true,
      confirmButtonText: "Anular venta",
      cancelButtonText: "Volver",
      confirmButtonColor: "#dc2626",
      background: "#ffffff",
      color: "#0f172a",
    });

    if (!result.isConfirmed) {
      return;
    }

    setIsCancellingSale(true);

    try {
      await cancelCompletedPosSale(saleId, reasonId, notes);
      const [salesData] = await Promise.all([
        fetchRecentPosSales(currentSession.id),
        loadCatalog(selectedBranchId),
        loadBootstrap(selectedBranchId),
      ]);
      setRecentSales(salesData);
      await Swal.fire({
        icon: "success",
        title: "Venta anulada",
        text: "La venta se anulo correctamente.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[pos/ui] Error al anular venta", {
        message,
        saleId,
      });
      await Swal.fire({
        icon: "error",
        title: "No se pudo anular la venta",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } finally {
      setIsCancellingSale(false);
    }
  }

  async function handleCheckout() {
    if (!activeSession || activeSession.status !== "open") {
      await Swal.fire({
        icon: "warning",
        title: "Sesion cerrada",
        text: "La sesion POS ya esta cerrada.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    if (cartItems.length === 0) {
      await Swal.fire({
        icon: "warning",
        title: "Carrito vacio",
        text: "Agrega al menos un servicio o producto.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    if (!selectedCustomer) {
      await Swal.fire({
        icon: "warning",
        title: "Selecciona un cliente",
        text: "Debes elegir un cliente antes de cerrar la venta.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    if (selectedCustomer.id === customerVariousId) {
      const result = await Swal.fire({
        icon: "warning",
        title: "Cliente varios",
        text: "Esta venta no tiene cliente identificado. Se guardara como Cliente varios y no acumulara historial ni rewards. ¿Deseas continuar?",
        showCancelButton: true,
        confirmButtonText: "Continuar",
        cancelButtonText: "Volver",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });

      if (!result.isConfirmed) {
        return;
      }
    }

    if (barberRequired && !selectedBarberId) {
      await Swal.fire({
        icon: "warning",
        title: "Falta el barbero",
        text: "Selecciona el barbero que realizo el servicio.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    if (pendingBalance > 0 && !internalCredit) {
      await Swal.fire({
        icon: "warning",
        title: "Pago incompleto",
        text: "El monto pagado no cubre el total.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    const hasCashPayment = payments.some((payment) => payment.allows_change);
    if (changeAmount > 0 && !hasCashPayment) {
      await Swal.fire({
        icon: "warning",
        title: "Vuelto no permitido",
        text: "El excedente solo puede registrarse como vuelto cuando hay pago en efectivo.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    setIsClosingSale(true);

    let checkoutPayload: PosCheckoutPayload | null = null;
    try {
      const idempotencyKey = checkoutIdempotencyKey ?? crypto.randomUUID();
      setCheckoutIdempotencyKey(idempotencyKey);
      checkoutPayload = {
        idempotency_key: idempotencyKey,
        pos_session_id: currentSession.id,
        branch_id: selectedBranchId,
        customer_id: selectedCustomer.id,
        barber_id: selectedBarberId || null,
        reservation_id: activeReservationId,
        reward_entitlement_id: selectedRewardEntitlementId || null,
        employee_benefit_rule_id: selectedInternalBenefitRuleId || null,
        internal_credit: internalCredit,
        authorization_pin: internalAuthorizationPin || null,
        items: cartItems.map((item) => ({
          catalog_id: item.catalog_id,
          item_type: item.item_type,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount_amount: item.discount_amount,
          is_courtesy: item.is_courtesy,
          courtesy_reason: item.courtesy_reason,
        })),
        payments: internalCredit ? [] : payments.map((payment) => ({
          payment_method_id: payment.payment_method_id,
          amount: payment.amount,
          tendered_amount: payment.tendered_amount,
          change_amount: payment.change_amount,
        })),
      };
      const result = await checkoutPosSale(checkoutPayload);

      setClosedSale(result);
      setCheckoutIdempotencyKey(null);
      clearCurrentDraft();
      await loadCatalog(selectedBranchId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[pos/ui] Error al cerrar la venta", {
        message,
        sessionId: currentSession.id,
      });
      if (!navigator.onLine && checkoutPayload) {
        await enqueuePosCheckout(checkoutPayload);
        setPendingOfflineCount((count) => count + 1);
        clearCurrentDraft();
        setCartItems([]);
        setPayments([]);
        await Swal.fire({
          icon: "info",
          title: "Venta pendiente de sincronización",
          text: "Se guardó solo en este dispositivo y se enviará automáticamente al recuperar internet. No cierres la sesión POS.",
          confirmButtonColor: "#0f766e",
        });
        return;
      }
      await Swal.fire({
        icon: "error",
        title: "No se pudo cerrar la venta",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } finally {
      setIsClosingSale(false);
    }
  }

  function resetAfterCompletedSale() {
    clearCurrentDraft();
    setClosedSale(null);
    setCartItems([]);
    setPayments([]);
    setCheckoutIdempotencyKey(null);
    setSelectedBarberId("");
    setSelectedRewardEntitlementId("");
    setSelectedReservationId(null);
    setReservationSuggestion(null);
    setSelectedCustomer(customerVarious ?? null);
  }

  async function handleAddProduct(product: (typeof visibleProducts)[number]) {
    if (!product.allow_custom_price) {
      await addProduct(product);
      return;
    }

    const result = await Swal.fire({
      icon: "info",
      title: "Precio personalizado",
      input: "number",
      inputLabel: "Ingresa el precio del item personalizado.",
      inputValue: product.final_sale_price,
      inputAttributes: {
        min: "0.01",
        step: "0.01",
      },
      showCancelButton: true,
      confirmButtonText: "Agregar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#0f766e",
      background: "#ffffff",
      color: "#0f172a",
      inputValidator: (value) => {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue) || numericValue <= 0) {
          return "Ingresa el precio del item personalizado.";
        }

        return null;
      },
    });

    if (!result.isConfirmed) {
      return;
    }

    await addProduct(product, Number(result.value));
  }

  async function handleAddService(service: (typeof visibleServices)[number]) {
    if (!service.allow_custom_price) {
      await addService(service);
      return;
    }

    const result = await Swal.fire({
      icon: "info",
      title: "Precio personalizado",
      input: "number",
      inputLabel: "Ingresa el precio del item personalizado.",
      inputValue: service.final_price,
      inputAttributes: {
        min: "0.01",
        step: "0.01",
      },
      showCancelButton: true,
      confirmButtonText: "Agregar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#0f766e",
      background: "#ffffff",
      color: "#0f172a",
      inputValidator: (value) => {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue) || numericValue <= 0) {
          return "Ingresa el precio del item personalizado.";
        }

        return null;
      },
    });

    if (!result.isConfirmed) {
      return;
    }

    await addService(service, Number(result.value));
  }

  if (currentSession.status === "pending_close") {
    return (
      <div className="flex h-screen items-center justify-center overflow-hidden bg-slate-50 px-4">
        <section className="w-full max-w-xl rounded-[1.5rem] border border-amber-200 bg-white p-6 shadow-sm">
          <p className="text-lg font-semibold text-slate-900">Hay una sesion pendiente de cierre</p>
          <p className="mt-2 text-sm text-slate-600">
            Esta sesion corresponde a un dia anterior. Debes cerrarla antes de registrar ventas.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button type="button" onClick={() => void handleOpenCloseSessionModal()}>
              Cerrar sesion pendiente
            </Button>
            <Link href="/control/pos" className="inline-flex h-10 items-center rounded-md border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Volver al panel
            </Link>
          </div>
        </section>
        <PosSessionCloseModal
          open={isCloseSessionModalOpen}
          summary={closeSessionSummary}
          countedAmounts={countedAmounts}
          notes={closingNotes}
          isLoading={isLoadingCloseSummary}
          isSubmitting={isClosingSession}
          onCountedAmountChange={(methodId, value) =>
            setCountedAmounts((current) => ({ ...current, [methodId]: value }))
          }
          onNotesChange={setClosingNotes}
          onClose={() => setIsCloseSessionModalOpen(false)}
          onSubmit={() => void handleCloseSession()}
        />
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-slate-50">
      <header className="flex h-14 items-center justify-between border-b border-stone-300 bg-stone-100 px-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-4">
          <div className="hidden min-w-0 items-center gap-3 text-xs text-stone-500 lg:flex">
            <span className="flex items-center gap-1.5">
              <FontAwesomeIcon icon={faBuilding} className="h-3 w-3" />
              {activeSession.branch_name ?? "Sin sede"}
            </span>
            <span className="text-stone-300">•</span>
            <span className="flex items-center gap-1.5 text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Sesion activa
            </span>
            <span className="text-stone-300">•</span>
            <span className="flex items-center gap-1.5">
              <FontAwesomeIcon icon={faUser} className="h-3 w-3" />
              {activeSession.opened_by_name ?? activeSession.opened_by ?? "Sin usuario"}
            </span>
            <span className="text-stone-300">•</span>
            <span className="flex items-center gap-1.5">
              <FontAwesomeIcon icon={faClock} className="h-3 w-3" />
              {formatDateTime(currentSession.opened_at)}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/control/pos"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-xs font-semibold text-stone-600 transition hover:bg-stone-200 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:ring-offset-2 focus:ring-offset-stone-100"
          >
            <FontAwesomeIcon icon={faArrowLeft} className="h-3.5 w-3.5" />
            Volver al panel
          </Link>
          <Button
            type="button"
            className="h-9 gap-2 bg-stone-200 px-3 text-xs text-stone-700 hover:bg-emerald-100 hover:text-emerald-800"
            onClick={() => setIsReservationsOpen(true)}
          >
            <FontAwesomeIcon icon={faCalendarDays} className="h-3.5 w-3.5" />
            Reservas
          </Button>
          <Button
            type="button"
            className="h-9 gap-2 bg-stone-200 px-3 text-xs text-stone-700 hover:bg-amber-50 hover:text-amber-800"
            onClick={() => {
              void handleOpenRecentSalesModal();
            }}
          >
            <FontAwesomeIcon icon={faReceipt} className="h-3.5 w-3.5" />
            Ventas recientes
          </Button>
          <Button
            type="button"
            className="h-9 gap-2 bg-rose-600 px-3 text-xs text-white hover:bg-rose-700"
            onClick={() => {
              void handleOpenCloseSessionModal();
            }}
          >
            <FontAwesomeIcon icon={faPowerOff} className="h-3.5 w-3.5" />
            Cerrar sesion POS
          </Button>
        </div>
      </header>

      {activeReservationId ? <div className="absolute left-4 top-16 z-20 rounded-b-lg border border-sky-200 bg-sky-50 px-3 py-1 text-xs text-sky-800">Venta originada desde reserva{reservationSuggestion ? ` - Sugerencia: ${reservationSuggestion}` : ""}</div> : null}

      <main className="grid h-[calc(100vh-4rem)] grid-cols-1 overflow-hidden lg:grid-cols-[460px_minmax(0,1fr)]">
        {isLoadingCatalog ? (
          <section className="flex items-center justify-center p-8 lg:col-span-2">
            <PosLoadingScreen label="Cargando catalogo POS..." storageKey="catalog" fallbackMs={1200} />
          </section>
        ) : (
          <>
            <aside className="min-h-0 overflow-hidden border-b border-slate-200 lg:border-b-0 lg:border-r">
              <PosCart
                customer={selectedCustomer}
                customerVariousId={customerVariousId}
                items={cartItems}
                barbers={employees}
                selectedBarberId={selectedBarberId}
                barberRequired={barberRequired}
                availableRewards={availableRewards}
                selectedRewardEntitlementId={selectedRewardEntitlementId}
                rewardDiscount={rewardDiscount}
                internalBenefitDiscount={internalBenefitDiscount}
                internalCustomerOptions={internalCustomerOptions}
                internalOptionsError={internalOptionsError}
                selectedInternalBenefit={selectedInternalBenefit}
                selectedInternalBenefitRuleId={selectedInternalBenefitRuleId}
                internalCredit={internalCredit}
                internalAuthorizationPin={internalAuthorizationPin}
                branchId={selectedBranchId}
                isLoadingRewards={isLoadingRewards}
                paymentMethods={paymentMethods}
                payments={payments}
                subtotal={subtotal}
                discountTotal={discountTotal}
                courtesyTotal={courtesyTotal}
                total={checkoutTotal}
                isClosingSale={isClosingSale}
                canCheckout={canCheckout}
                onCheckout={() => {
                  void handleCheckout();
                }}
                onCustomerChange={setSelectedCustomer}
                onCustomerSearch={searchPosCustomers}
                onBarberChange={setSelectedBarberId}
                onRewardChange={(value) => void handleRewardChange(value)}
                onInternalBenefitChange={(value) => { setSelectedInternalBenefitRuleId(value); if (value) { setSelectedRewardEntitlementId(""); setInternalCredit(false); } }}
                onInternalCreditChange={(value) => { setInternalCredit(value); if (value) { setSelectedRewardEntitlementId(""); setSelectedInternalBenefitRuleId(""); } }}
                onInternalAuthorizationPinChange={setInternalAuthorizationPin}
                onDecreaseItem={(itemId) => {
                  void changeItemQuantity(itemId, -1);
                }}
                onIncreaseItem={(itemId) => {
                  void changeItemQuantity(itemId, 1);
                }}
                onRemoveItem={(itemId) =>
                  setCartItems((current) => current.filter((item) => item.id !== itemId))
                }
                onToggleCourtesy={(itemId) =>
                  setCartItems((current) =>
                    current.map((item) =>
                      item.id === itemId
                        ? {
                          ...item,
                          is_courtesy: !item.is_courtesy,
                          courtesy_reason: "",
                        }
                        : item,
                    ),
                  )
                }
                onAddPayment={(payment) => setPayments((current) => [...current, payment])}
                onRemovePayment={(paymentId) =>
                  setPayments((current) => current.filter((payment) => payment.id !== paymentId))
                }
              />
            </aside>

            <section className="min-h-0 overflow-hidden">
              <PosCatalog
                search={catalogSearch}
                onSearchChange={setCatalogSearch}
                categoryFilter={categoryFilter}
                onCategoryFilterChange={setCategoryFilter}
                serviceCategories={serviceCategories}
                productCategories={productCategories}
                services={visibleServices}
                products={visibleProducts}
                onAddService={(service) => {
                  void handleAddService(service);
                }}
                onAddProduct={(product) => {
                  void handleAddProduct(product);
                }}
              />
            </section>
          </>
        )}
      </main>

      <PosSaleSuccessModal
        open={closedSale !== null}
        data={closedSale}
        onClose={resetAfterCompletedSale}
        onNewSale={resetAfterCompletedSale}
      />

      <PosSessionCloseModal
        open={isCloseSessionModalOpen}
        summary={closeSessionSummary}
        countedAmounts={countedAmounts}
        notes={closingNotes}
        isLoading={isLoadingCloseSummary}
        isSubmitting={isClosingSession}
        onCountedAmountChange={(methodId, value) =>
          setCountedAmounts((current) => ({ ...current, [methodId]: value }))
        }
        onNotesChange={setClosingNotes}
        onClose={() => setIsCloseSessionModalOpen(false)}
        onSubmit={() => {
          void handleCloseSession();
        }}
      />

      <PosSaleCancelModal
        open={isCancelModalOpen}
        sales={recentSales}
        isLoading={isLoadingRecentSales}
        isSubmitting={isCancellingSale}
        onClose={() => setIsCancelModalOpen(false)}
        onSubmit={(saleId, reasonId, notes) => {
          void handleCancelSale(saleId, reasonId, notes);
        }}
      />
      <PosReservationsModal open={isReservationsOpen} sessionId={currentSession.id} onClose={() => setIsReservationsOpen(false)} onUse={(row) => { if (!row.customer) return; setSelectedCustomer(row.customer); setSelectedBarberId(row.barberId ?? ""); setSelectedReservationId(row.id); setReservationSuggestion(row.serviceName); setIsReservationsOpen(false); }} />
    </div>
  );
}
