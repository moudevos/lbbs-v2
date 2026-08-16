"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Swal from "sweetalert2";

import {
  fetchPosAvailableRewards,
  fetchPosBootstrap,
  fetchPosEmployees,
  fetchPosInternalCustomerOptions,
  fetchPosProducts,
  fetchPosServices,
  openPosSession,
  searchPosCustomers,
} from "@/features/pos/pos-actions";
import type {
  OpenPosSessionPayload,
  PosBootstrapPayload,
  PosCartItem,
  PosCatalogTab,
  PosCustomerRecord,
  PosEmployeeRecord,
  PosInternalCustomerOptions,
  PosPreparedPayment,
  PosProductRecord,
  PosRewardEntitlement,
  PosServiceRecord,
} from "@/features/pos/pos-types";
import {
  buildProductCartItem,
  buildProductCartItemWithPrice,
  buildServiceCartItem,
  canAddProductQuantity,
  cartRequiresBarber,
  getCartCourtesyTotal,
  getCartDiscountTotal,
  getCartSubtotal,
  getCartTotal,
} from "@/features/pos/pos-utils";
import {
  getPosDraftKey,
  readPosDraft,
  removePosDraft,
  writePosDraft,
} from "@/features/pos/pos-draft";
import { normalizeSearchText } from "@/lib/utils/search";

const emptyOpenSessionForm: OpenPosSessionPayload = {
  branch_id: "",
  opening_cash_amount: "",
  notes: "",
};

export function usePosWorkspace() {
  const searchParams = useSearchParams();
  const [bootstrap, setBootstrap] = useState<PosBootstrapPayload | null>(null);
  const [services, setServices] = useState<PosServiceRecord[]>([]);
  const [products, setProducts] = useState<PosProductRecord[]>([]);
  const [employees, setEmployees] = useState<PosEmployeeRecord[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [catalogTab, setCatalogTab] = useState<PosCatalogTab>("all");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [cartItems, setCartItems] = useState<PosCartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<PosCustomerRecord | null>(null);
  const [selectedBarberId, setSelectedBarberId] = useState("");
  const [selectedReservationId, setSelectedReservationId] = useState<string | null>(null);
  const [suggestedServiceId, setSuggestedServiceId] = useState<string | null>(null);
  const [availableRewards, setAvailableRewards] = useState<PosRewardEntitlement[]>([]);
  const [selectedRewardEntitlementId, setSelectedRewardEntitlementId] = useState("");
  const [internalCustomerOptions, setInternalCustomerOptions] = useState<PosInternalCustomerOptions | null>(null);
  const [selectedInternalBenefitRuleId, setSelectedInternalBenefitRuleId] = useState("");
  const [internalCredit, setInternalCredit] = useState(false);
  const [internalAuthorizationReason, setInternalAuthorizationReason] = useState("");
  const [internalAuthorizationPin, setInternalAuthorizationPin] = useState("");
  const [payments, setPayments] = useState<PosPreparedPayment[]>([]);
  const [checkoutIdempotencyKey, setCheckoutIdempotencyKey] = useState<string | null>(null);
  const [openSessionForm, setOpenSessionForm] =
    useState<OpenPosSessionPayload>(emptyOpenSessionForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpeningSession, setIsOpeningSession] = useState(false);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [isLoadingRewards, setIsLoadingRewards] = useState(false);
  const restoredDraftKeyRef = useRef<string | null>(null);

  const loadBootstrap = useCallback(async (branchId?: string, sessionId?: string, reservationId?: string) => {
    setIsLoading(true);

    try {
      const payload = (await fetchPosBootstrap(branchId, sessionId, reservationId)) as PosBootstrapPayload;
      const nextBranchId = payload.selectedBranchId || branchId || "";

      setBootstrap(payload);
      setSelectedBranchId(nextBranchId);
      setOpenSessionForm((current) => ({
        ...current,
        branch_id: nextBranchId,
      }));

      if (payload.customerVarious) {
        setSelectedCustomer((current) => current ?? payload.customerVarious);
      }
      if (payload.reservationPrefill) {
        setSelectedCustomer(payload.reservationPrefill.customer);
        setSelectedBarberId(payload.reservationPrefill.barberId ?? "");
        setSelectedReservationId(payload.reservationPrefill.id);
        setSuggestedServiceId(payload.reservationPrefill.serviceId ?? null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[pos/ui] Error al cargar bootstrap", { message });
      await Swal.fire({
        icon: "error",
        title: "No se pudo cargar el POS",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadCatalog = useCallback(async (branchId: string) => {
    if (!branchId) {
      setServices([]);
      setProducts([]);
      setEmployees([]);
      return;
    }

    setIsLoadingCatalog(true);

    try {
      const [nextServices, nextProducts, nextEmployees] = await Promise.all([
        fetchPosServices(branchId),
        fetchPosProducts(branchId),
        fetchPosEmployees(),
      ]);

      setServices(
        (nextServices ?? []).filter(
          (item: PosServiceRecord & { is_active?: boolean }) => item.is_active,
        ),
      );
      setProducts(
        (nextProducts ?? []).filter(
          (item: PosProductRecord & { is_active?: boolean }) => item.is_active,
        ),
      );
      setEmployees(
        (nextEmployees ?? []).filter(
          (employee: PosEmployeeRecord) =>
            employee.status === "active" &&
            employee.role === "barber" &&
            (!employee.branch_id || employee.branch_id === branchId),
        ),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[pos/ui] Error al cargar catalogo", { message, branchId });
      await Swal.fire({
        icon: "error",
        title: "No se pudo cargar el catalogo POS",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } finally {
      setIsLoadingCatalog(false);
    }
  }, []);

  useEffect(() => {
    const requestedSessionId = searchParams.get("session_id") ?? undefined;
    const requestedReservationId = searchParams.get("reservation_id") ?? undefined;
    const timer = window.setTimeout(() => {
      void loadBootstrap(undefined, requestedSessionId, requestedReservationId);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadBootstrap, searchParams]);

  useEffect(() => {
    if (!selectedBranchId) {
      return;
    }

    const timer = window.setTimeout(() => {
      void loadCatalog(selectedBranchId);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadCatalog, selectedBranchId]);

  useEffect(() => {
    if (!suggestedServiceId) return;
    const service = services.find((item) => item.id === suggestedServiceId);
    if (!service) return;
    const timer = window.setTimeout(() => {
      setCartItems((current) => current.some((item) => item.catalog_id === service.id && item.reservation_suggestion) ? current : [...current, { ...buildServiceCartItem(service), reservation_suggestion: true }]);
      setSuggestedServiceId(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [services, suggestedServiceId]);

  const activeSession = bootstrap?.activeSession ?? null;
  const activeReservationId = selectedReservationId;
  const branches = bootstrap?.branches ?? [];
  const paymentMethods = bootstrap?.paymentMethods ?? [];
  const courtesyReasons = bootstrap?.courtesyReasons ?? [];
  const customerVarious = bootstrap?.customerVarious ?? null;
  const customerVariousId = bootstrap?.customerVarious?.id ?? null;
  const isBranchLocked =
    bootstrap?.role !== "owner" && bootstrap?.role !== "admin" && Boolean(selectedBranchId);
  const draftKey =
    activeSession && bootstrap?.employee && selectedBranchId
      ? getPosDraftKey(activeSession.id, selectedBranchId, bootstrap.employee.id)
      : null;

  useEffect(() => {
    const employeeId = bootstrap?.employee?.id;
    if (!draftKey || cartItems.length === 0 || !activeSession || !employeeId) return;

    const timer = window.setTimeout(() => {
      writePosDraft(draftKey, {
        version: 3,
        savedAt: new Date().toISOString(),
        sessionId: activeSession.id,
        branchId: selectedBranchId,
        employeeId,
        customer: selectedCustomer,
        reservationId: selectedReservationId,
        barberId: selectedBarberId,
        rewardEntitlementId: selectedRewardEntitlementId,
        internalBenefitRuleId: selectedInternalBenefitRuleId,
        internalCredit,
        internalAuthorizationReason,
        items: cartItems,
        payments,
        checkoutIdempotencyKey,
      });
    }, 400);

    return () => window.clearTimeout(timer);
  }, [
    activeSession,
    bootstrap?.employee,
    cartItems,
    draftKey,
    selectedBarberId,
    selectedBranchId,
    selectedCustomer,
    selectedReservationId,
    selectedRewardEntitlementId,
    selectedInternalBenefitRuleId,
    internalCredit,
    internalAuthorizationReason,
    internalAuthorizationPin,
    payments,
    checkoutIdempotencyKey,
  ]);

  useEffect(() => {
    const employeeId = bootstrap?.employee?.id;
    if (
      !draftKey ||
      !activeSession ||
      activeSession.status !== "open" ||
      !employeeId ||
      isLoadingCatalog ||
      restoredDraftKeyRef.current === draftKey ||
      cartItems.length > 0
    ) {
      return;
    }

    restoredDraftKeyRef.current = draftKey;
    const draft = readPosDraft(draftKey);
    if (
      !draft ||
      draft.sessionId !== activeSession.id ||
      draft.branchId !== selectedBranchId ||
      draft.employeeId !== employeeId
    ) {
      return;
    }

    const validItems = draft.items.filter((item) => {
      if (item.item_type === "service") {
        return services.some((service) => service.id === item.catalog_id && service.is_active);
      }

      const product = products.find((entry) => entry.id === item.catalog_id && entry.is_active);
      return Boolean(product && (!product.is_stockable || Number(product.stock_quantity) >= item.quantity));
    });
    const barberAvailable = !draft.barberId || employees.some((employee) => employee.id === draft.barberId);
    const removedCount = draft.items.length - validItems.length;
    const changedPriceCount = validItems.filter((item) => {
      const catalog = item.item_type === "service"
        ? services.find((entry) => entry.id === item.catalog_id)
        : products.find((entry) => entry.id === item.catalog_id);
      const currentPrice = catalog && ("final_price" in catalog ? Number(catalog.final_price) : Number(catalog.final_sale_price));
      return currentPrice !== undefined && Number.isFinite(currentPrice) && currentPrice !== item.unit_price;
    }).length;

    void Swal.fire({
      icon: "info",
      title: "Encontramos una venta pendiente en este dispositivo.",
      text: [
        removedCount ? `${removedCount} item(s) ya no estan disponibles.` : "",
        changedPriceCount ? `${changedPriceCount} precio(s) cambiaron y se conservaran para revision.` : "",
        !barberAvailable ? "El barbero guardado ya no esta disponible." : "",
      ].filter(Boolean).join(" ") || "Puedes recuperar o descartar el borrador guardado.",
      showCancelButton: true,
      confirmButtonText: "Recuperar venta",
      cancelButtonText: "Descartar borrador",
      confirmButtonColor: "#0f766e",
      cancelButtonColor: "#64748b",
    }).then((result) => {
      if (!result.isConfirmed) {
        removePosDraft(draftKey);
        return;
      }

      setCartItems(validItems);
      setSelectedCustomer(draft.customer?.is_active ? draft.customer : customerVarious);
      setSelectedReservationId(draft.reservationId);
      setSelectedBarberId(barberAvailable ? draft.barberId : "");
      setSelectedRewardEntitlementId(draft.rewardEntitlementId);
      setSelectedInternalBenefitRuleId(draft.internalBenefitRuleId ?? "");
      setInternalCredit(Boolean(draft.internalCredit));
      setInternalAuthorizationReason(draft.internalAuthorizationReason ?? "");
      setPayments(draft.payments);
      setCheckoutIdempotencyKey(draft.checkoutIdempotencyKey);
    });
  }, [
    activeSession,
    bootstrap?.employee,
    cartItems.length,
    customerVarious,
    draftKey,
    employees,
    isLoadingCatalog,
    products,
    selectedBranchId,
    services,
  ]);

  const clearCurrentDraft = useCallback(() => {
    if (draftKey) removePosDraft(draftKey);
  }, [draftKey]);

  const visibleServices = useMemo(() => {
    const term = normalizeSearchText(catalogSearch);

    return services.filter((service) => {
      const matchesSearch =
        !term ||
        normalizeSearchText(service.name).includes(term) ||
        normalizeSearchText(service.category_name).includes(term);
      const matchesCategory = !categoryFilter || service.category_id === categoryFilter;

      return matchesSearch && matchesCategory;
    });
  }, [categoryFilter, catalogSearch, services]);

  const visibleProducts = useMemo(() => {
    const term = normalizeSearchText(catalogSearch);

    return products.filter((product) => {
      const matchesSearch =
        !term ||
        normalizeSearchText(product.name).includes(term) ||
        normalizeSearchText(product.category_name).includes(term) ||
        normalizeSearchText(product.sku).includes(term) ||
        normalizeSearchText(product.barcode).includes(term);
      const matchesCategory = !categoryFilter || product.category_id === categoryFilter;

      return matchesSearch && matchesCategory;
    });
  }, [categoryFilter, catalogSearch, products]);

  const serviceCategories = useMemo(
    () =>
      Array.from(
        new Map(
          services
            .filter((service) => service.category_id && service.category_name)
            .map((service) => [
              service.category_id as string,
              { id: service.category_id as string, name: service.category_name as string },
            ]),
        ).values(),
      ),
    [services],
  );

  const productCategories = useMemo(
    () =>
      Array.from(
        new Map(
          products
            .filter((product) => product.category_id && product.category_name)
            .map((product) => [
              product.category_id as string,
              { id: product.category_id as string, name: product.category_name as string },
            ]),
        ).values(),
      ),
    [products],
  );

  const subtotal = getCartSubtotal(cartItems);
  const discountTotal = getCartDiscountTotal(cartItems);
  const courtesyTotal = getCartCourtesyTotal(cartItems);
  const total = getCartTotal(cartItems);
  const barberRequired = cartRequiresBarber(cartItems);
  const selectedReward =
    availableRewards.find((reward) => reward.id === selectedRewardEntitlementId) ?? null;
  const selectedInternalBenefit = internalCustomerOptions?.rules.find((rule) => rule.id === selectedInternalBenefitRuleId) ?? null;
  const internalBenefitDiscount = useMemo(() => {
    if (!selectedInternalBenefit) return 0;
    return cartItems.reduce((sum, item) => {
      const matches = selectedInternalBenefit.applies_to === "all" || (
        selectedInternalBenefit.applies_to === item.item_type &&
        (item.item_type === "service" ? !selectedInternalBenefit.service_id || selectedInternalBenefit.service_id === item.catalog_id : !selectedInternalBenefit.product_id || selectedInternalBenefit.product_id === item.catalog_id)
      );
      if (!matches) return sum;
      const line = item.quantity * item.unit_price;
      const value = Number(selectedInternalBenefit.benefit_value);
      const discount = selectedInternalBenefit.benefit_type === "free" ? line : selectedInternalBenefit.benefit_type === "fixed_price" ? Math.max(line - value * item.quantity, 0) : line * value / 100;
      return sum + discount;
    }, 0);
  }, [cartItems, selectedInternalBenefit]);

  function handleSelectedCustomerChange(customer: PosCustomerRecord | null) {
    setSelectedCustomer(customer);
    setAvailableRewards([]);
    setSelectedRewardEntitlementId("");
    setInternalCustomerOptions(null);
    setSelectedInternalBenefitRuleId("");
    setInternalCredit(false);
    setInternalAuthorizationReason("");
  }

  useEffect(() => {
    if (!selectedCustomer || selectedCustomer.id === customerVariousId || !selectedBranchId) return;
    const timer = window.setTimeout(() => {
      void fetchPosInternalCustomerOptions(selectedCustomer.id, selectedBranchId)
        .then((options) => {
          setInternalCustomerOptions(options);
          setSelectedInternalBenefitRuleId((current) => options.rules.some((rule) => rule.id === current) ? current : "");
          if (!options.canUseCredit) setInternalCredit(false);
        })
        .catch(() => setInternalCustomerOptions(null));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [customerVariousId, selectedBranchId, selectedCustomer]);

  useEffect(() => {
    async function loadRewards(customerId: string) {
      setIsLoadingRewards(true);

      try {
        const data = await fetchPosAvailableRewards(customerId);
        setAvailableRewards(data);
        setSelectedRewardEntitlementId((current) =>
          data.some((item) => item.id === current) ? current : "",
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "No se pudieron cargar los rewards.";
        console.error("[pos/ui] Error al cargar rewards disponibles", {
          message,
          customerId,
        });
        setAvailableRewards([]);
        setSelectedRewardEntitlementId("");
      } finally {
        setIsLoadingRewards(false);
      }
    }

    if (!selectedCustomer || selectedCustomer.id === customerVariousId) {
      return;
    }

    const timer = window.setTimeout(() => {
      void loadRewards(selectedCustomer.id);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [customerVariousId, selectedCustomer]);

  async function addService(service: PosServiceRecord, customUnitPrice?: number) {
    if (
      typeof customUnitPrice === "number" &&
      (!Number.isFinite(customUnitPrice) || customUnitPrice <= 0)
    ) {
      await Swal.fire({
        icon: "warning",
        title: "Precio invalido",
        text: "Ingresa el precio del item personalizado.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    const nextItem = buildServiceCartItem({
      ...service,
      final_price:
        typeof customUnitPrice === "number"
          ? customUnitPrice.toFixed(2)
          : service.final_price,
    });

    setCartItems((current) => [...current, nextItem]);
  }

  async function addProduct(product: PosProductRecord, customUnitPrice?: number) {
    if (product.is_stockable && Number(product.stock_quantity) <= 0) {
      await Swal.fire({
        icon: "warning",
        title: "Stock insuficiente",
        text: "Stock insuficiente en esta sede.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    if (
      typeof customUnitPrice === "number" &&
      (!Number.isFinite(customUnitPrice) || customUnitPrice <= 0)
    ) {
      await Swal.fire({
        icon: "warning",
        title: "Precio invalido",
        text: "Ingresa el precio del item personalizado.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    const nextItem =
      typeof customUnitPrice === "number"
        ? buildProductCartItemWithPrice(product, customUnitPrice)
        : buildProductCartItem(product);

    setCartItems((current) => [...current, nextItem]);
  }

  async function changeItemQuantity(itemId: string, delta: number) {
    const item = cartItems.find((entry) => entry.id === itemId);

    if (!item) {
      return;
    }

    const nextQuantity = item.quantity + delta;

    if (nextQuantity <= 0) {
      setCartItems((current) => current.filter((entry) => entry.id !== itemId));
      return;
    }

    if (!canAddProductQuantity(item, nextQuantity)) {
      await Swal.fire({
        icon: "warning",
        title: "Stock insuficiente",
        text: "Stock insuficiente en esta sede.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    setCartItems((current) =>
      current.map((entry) =>
        entry.id === itemId ? { ...entry, quantity: nextQuantity } : entry,
      ),
    );
  }

  async function handleOpenSession() {
    if (!openSessionForm.branch_id) {
      await Swal.fire({
        icon: "warning",
        title: "Falta la sede",
        text: "Selecciona la sede donde se abrira la sesion POS.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return false;
    }

    const openingCashAmount = Number(openSessionForm.opening_cash_amount || "0");
    if (!Number.isFinite(openingCashAmount) || openingCashAmount < 0) {
      await Swal.fire({
        icon: "warning",
        title: "Monto invalido",
        text: "El monto inicial debe ser mayor o igual a cero.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return false;
    }

    setIsOpeningSession(true);

    try {
      await openPosSession(openSessionForm);
      await loadBootstrap(openSessionForm.branch_id);
      await Swal.fire({
        icon: "success",
        title: "Sesion POS lista",
        text: "La sesion POS quedo disponible para esta sede.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[pos/ui] Error al abrir sesion", { message });
      await Swal.fire({
        icon: "error",
        title: "No se pudo abrir la sesion POS",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return false;
    } finally {
      setIsOpeningSession(false);
    }
  }

  return {
    activeSession,
    activeReservationId,
    availableRewards,
    barberRequired,
    bootstrap,
    branches,
    cartItems,
    catalogSearch,
    catalogTab,
    categoryFilter,
    courtesyTotal,
    courtesyReasons,
    customerVarious,
    customerVariousId,
    discountTotal,
    employees,
    isBranchLocked,
    isLoading,
    isLoadingCatalog,
    isLoadingRewards,
    internalAuthorizationReason,
    internalAuthorizationPin,
    internalBenefitDiscount,
    internalCredit,
    internalCustomerOptions,
    isOpeningSession,
    openSessionForm,
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
    loadBootstrap,
    loadCatalog,
    addProduct,
    addService,
    changeItemQuantity,
    clearCurrentDraft,
    handleOpenSession,
    searchPosCustomers,
    setCartItems,
    setCatalogSearch,
    setCatalogTab,
    setCategoryFilter,
    setOpenSessionForm,
    setPayments,
    setCheckoutIdempotencyKey,
    setSelectedBarberId,
    setSelectedBranchId,
    setSelectedCustomer: handleSelectedCustomerChange,
    setSelectedRewardEntitlementId,
    setSelectedInternalBenefitRuleId,
    setInternalCredit,
    setInternalAuthorizationReason,
    setInternalAuthorizationPin,
    setSelectedReservationId,
  };
}
