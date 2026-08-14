"use client";

import { faMagnifyingGlass, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { BranchRecord } from "@/features/branches/types";
import { ProductBranchPriceModal } from "@/features/products/ProductBranchPriceModal";
import { ProductDetailModal } from "@/features/products/ProductDetailModal";
import { ProductFormModal } from "@/features/products/ProductFormModal";
import { ProductsTable } from "@/features/products/ProductsTable";
import { ProductStockModal } from "@/features/products/ProductStockModal";
import { StockMovementFormModal } from "@/features/products/StockMovementFormModal";
import type {
  ProductBranchPriceFormValue,
  ProductBranchPriceRecord,
  ProductCategoryRecord,
  ProductFormValue,
  ProductRecord,
  ProductStockSummary,
  StockMovementFormValue,
  StockMovementRecord,
} from "@/features/products/product-types";

const emptyProductForm: ProductFormValue = {
  category_id: "",
  sku: "",
  name: "",
  slug: "",
  description: "",
  barcode: "",
  unit: "unidad",
  cost_price: "",
  base_sale_price: "",
  allow_custom_price: false,
  is_stockable: true,
  is_courtesy_allowed: false,
  is_active: true,
};

const emptyBranchPriceForm: ProductBranchPriceFormValue = {
  id: "",
  product_id: "",
  branch_id: "",
  sale_price: "",
  is_active: true,
};

const emptyStockMovementForm: StockMovementFormValue = {
  product_id: "",
  branch_id: "",
  movement_type: "purchase",
  quantity: "",
  unit_cost: "",
  notes: "",
};

function toProductFormValue(product?: ProductRecord | null): ProductFormValue {
  if (!product) {
    return emptyProductForm;
  }

  return {
    category_id: product.category_id ?? "",
    sku: product.sku ?? "",
    name: product.name,
    slug: product.slug,
    description: product.description ?? "",
    barcode: product.barcode ?? "",
    unit: product.unit,
    cost_price: product.cost_price,
    base_sale_price: product.base_sale_price,
    allow_custom_price: product.allow_custom_price,
    is_stockable: product.is_stockable,
    is_courtesy_allowed: product.is_courtesy_allowed,
    is_active: product.is_active,
  };
}

function buildBranchPriceFormValue(
  productId: string,
  branchId: string,
  price?: ProductBranchPriceRecord | null,
): ProductBranchPriceFormValue {
  if (!price) {
    return {
      id: "",
      product_id: productId,
      branch_id: branchId,
      sale_price: "",
      is_active: true,
    };
  }

  return {
    id: price.id,
    product_id: price.product_id,
    branch_id: price.branch_id,
    sale_price: price.sale_price,
    is_active: price.is_active,
  };
}

function findBranchPrice(branchPrices: ProductBranchPriceRecord[], branchId: string) {
  return branchPrices.find((item) => item.branch_id === branchId) ?? null;
}

function normalizeText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

type ProductsPanelProps = {
  canManageCatalog?: boolean;
};

export function ProductsPanel({ canManageCatalog = true }: ProductsPanelProps) {
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [categories, setCategories] = useState<ProductCategoryRecord[]>([]);
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [branchPrices, setBranchPrices] = useState<ProductBranchPriceRecord[]>([]);
  const [stockByBranch, setStockByBranch] = useState<ProductStockSummary[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovementRecord[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [productForm, setProductForm] = useState<ProductFormValue>(emptyProductForm);
  const [branchPriceForm, setBranchPriceForm] =
    useState<ProductBranchPriceFormValue>(emptyBranchPriceForm);
  const [stockMovementForm, setStockMovementForm] =
    useState<StockMovementFormValue>(emptyStockMovementForm);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [isSavingBranchPrice, setIsSavingBranchPrice] = useState(false);
  const [isSavingStockMovement, setIsSavingStockMovement] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isBranchPriceModalOpen, setIsBranchPriceModalOpen] = useState(false);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [isStockMovementModalOpen, setIsStockMovementModalOpen] = useState(false);

  async function loadSupportData() {
    try {
      const [categoriesResponse, branchesResponse] = await Promise.all([
        fetch("/api/admin/product-categories", { cache: "no-store" }),
        fetch("/api/admin/branches", { cache: "no-store" }),
      ]);

      const categoriesPayload = await categoriesResponse.json();
      const branchesPayload = await branchesResponse.json();

      if (!categoriesResponse.ok) {
        throw new Error(
          categoriesPayload.error || "No se pudieron cargar las categorias de productos.",
        );
      }

      if (!branchesResponse.ok) {
        throw new Error(branchesPayload.error || "No se pudieron cargar las sedes.");
      }

      const nextBranches = branchesPayload.data ?? [];
      setCategories(categoriesPayload.data ?? []);
      setBranches(nextBranches);
      setSelectedBranchId((current) => current || nextBranches[0]?.id || "");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[products/ui] Error al cargar soporte", { message });
      await Swal.fire({
        icon: "error",
        title: "No se pudieron cargar los datos base",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    }
  }

  async function loadProducts(branchId: string) {
    setIsLoading(true);

    try {
      const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
      const response = await fetch(`/api/admin/products${query}`, { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "No se pudieron cargar los productos.");
      }

      setProducts(payload.data ?? []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[products/ui] Error al cargar productos", { message, branchId });
      await Swal.fire({
        icon: "error",
        title: "No se pudieron cargar los productos",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function loadBranchPrices(productId: string) {
    const response = await fetch(
      `/api/admin/product-branch-prices?productId=${encodeURIComponent(productId)}`,
      { cache: "no-store" },
    );
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "No se pudieron cargar los precios por sede.");
    }

    return payload.data as ProductBranchPriceRecord[];
  }

  async function loadStockDetails(productId: string) {
    const response = await fetch(
      `/api/admin/stock-movements?productId=${encodeURIComponent(productId)}`,
      { cache: "no-store" },
    );
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "No se pudo cargar el stock del producto.");
    }

    return {
      stockByBranch: (payload.stockByBranch ?? []) as ProductStockSummary[],
      movements: (payload.movements ?? []) as StockMovementRecord[],
    };
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSupportData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProducts(selectedBranchId);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [selectedBranchId]);

  const visibleProducts = useMemo(() => {
    const term = search.trim().toLowerCase();

    return products.filter((product) => {
      const matchesTerm =
        !term ||
        product.name.toLowerCase().includes(term) ||
        product.slug.toLowerCase().includes(term) ||
        (product.sku ?? "").toLowerCase().includes(term) ||
        (product.barcode ?? "").toLowerCase().includes(term);

      const matchesCategory = !categoryFilter || product.category_id === categoryFilter;
      const matchesStatus =
        !statusFilter ||
        (statusFilter === "active" && product.is_active) ||
        (statusFilter === "inactive" && !product.is_active);

      return matchesTerm && matchesCategory && matchesStatus;
    });
  }, [products, search, categoryFilter, statusFilter]);

  const selectedBranchName =
    branches.find((branch) => branch.id === selectedBranchId)?.name ?? null;

  function startCreateProduct() {
    setEditingProductId(null);
    setProductForm(emptyProductForm);
    setIsProductModalOpen(true);
  }

  function startEditProduct(product: ProductRecord) {
    setEditingProductId(product.id);
    setProductForm(toProductFormValue(product));
    setIsProductModalOpen(true);
  }

  function openDetailModal(product: ProductRecord) {
    setSelectedProduct(product);
    setIsDetailModalOpen(true);
  }

  function closeDetailModal() {
    setIsDetailModalOpen(false);
    setSelectedProduct(null);
  }

  function closeProductModal() {
    setIsProductModalOpen(false);
  }

  async function handleSaveProduct() {
    if (!productForm.name.trim() || !productForm.slug.trim()) {
      await Swal.fire({
        icon: "warning",
        title: "Faltan datos",
        text: "Nombre y slug son obligatorios.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    const costPrice = Number(productForm.cost_price);
    const baseSalePrice = Number(productForm.base_sale_price);

    if (!Number.isFinite(costPrice) || costPrice < 0) {
      await Swal.fire({
        icon: "warning",
        title: "Costo invalido",
        text: "El costo de compra debe ser mayor o igual a cero.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    if (!Number.isFinite(baseSalePrice) || baseSalePrice < 0) {
      await Swal.fire({
        icon: "warning",
        title: "Precio invalido",
        text: "El precio de venta base debe ser mayor o igual a cero.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    setIsSavingProduct(true);

    try {
      const payload = {
        category_id: normalizeText(productForm.category_id),
        sku: normalizeText(productForm.sku),
        name: productForm.name.trim(),
        slug: productForm.slug.trim(),
        description: normalizeText(productForm.description),
        barcode: normalizeText(productForm.barcode),
        unit: productForm.unit,
        cost_price: productForm.cost_price,
        base_sale_price: productForm.base_sale_price,
        is_stockable: productForm.is_stockable,
        allow_custom_price: productForm.allow_custom_price,
        is_courtesy_allowed: productForm.is_courtesy_allowed,
        is_active: productForm.is_active,
      };

      const response = await fetch(
        editingProductId ? `/api/admin/products/${editingProductId}` : "/api/admin/products",
        {
          method: editingProductId ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "No se pudo guardar el producto.");
      }

      await Swal.fire({
        icon: "success",
        title: editingProductId ? "Producto actualizado" : "Producto creado",
        text: editingProductId
          ? "El producto quedo actualizado."
          : "El producto quedo registrado.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });

      closeProductModal();
      setProductForm(emptyProductForm);
      setEditingProductId(null);
      await loadProducts(selectedBranchId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[products/ui] Error al guardar producto", { message });
      await Swal.fire({
        icon: "error",
        title: "No se pudo guardar el producto",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } finally {
      setIsSavingProduct(false);
    }
  }

  async function toggleProduct(product: ProductRecord) {
    const result = await Swal.fire({
      icon: "question",
      title: product.is_active ? "Desactivar producto" : "Activar producto",
      text: product.is_active
        ? "El producto quedara inactivo hasta que vuelvas a habilitarlo."
        : "El producto volvera a estar disponible para el catalogo.",
      showCancelButton: true,
      confirmButtonText: product.is_active ? "Desactivar" : "Activar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#0f766e",
      background: "#ffffff",
      color: "#0f172a",
    });

    if (!result.isConfirmed) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/products/${product.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          category_id: product.category_id,
          sku: product.sku,
          name: product.name,
          slug: product.slug,
          description: product.description,
          barcode: product.barcode,
          unit: product.unit,
          cost_price: product.cost_price,
          base_sale_price: product.base_sale_price,
          is_stockable: product.is_stockable,
          allow_custom_price: product.allow_custom_price,
          is_courtesy_allowed: product.is_courtesy_allowed,
          is_active: !product.is_active,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "No se pudo cambiar el estado del producto.");
      }

      await loadProducts(selectedBranchId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[products/ui] Error al cambiar estado del producto", { message });
      await Swal.fire({
        icon: "error",
        title: "No se pudo cambiar el estado",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    }
  }

  async function openBranchPriceModal(product: ProductRecord) {
    setSelectedProduct(product);
    setIsBranchPriceModalOpen(true);

    try {
      const prices = await loadBranchPrices(product.id);
      setBranchPrices(prices);
      const nextBranchId = selectedBranchId || branches[0]?.id || "";
      setBranchPriceForm(
        buildBranchPriceFormValue(
          product.id,
          nextBranchId,
          findBranchPrice(prices, nextBranchId),
        ),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[products/ui] Error al abrir precios por sede", {
        message,
        productId: product.id,
      });
      await Swal.fire({
        icon: "error",
        title: "No se pudieron cargar los precios por sede",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      setIsBranchPriceModalOpen(false);
      setSelectedProduct(null);
    }
  }

  function closeBranchPriceModal() {
    setIsBranchPriceModalOpen(false);
    setSelectedProduct(null);
    setBranchPrices([]);
    setBranchPriceForm(emptyBranchPriceForm);
  }

  function handleBranchPriceFormChange(next: ProductBranchPriceFormValue) {
    if (next.branch_id !== branchPriceForm.branch_id) {
      const matching = findBranchPrice(branchPrices, next.branch_id);
      setBranchPriceForm(
        buildBranchPriceFormValue(
          selectedProduct?.id ?? next.product_id,
          next.branch_id,
          matching,
        ),
      );
      return;
    }

    setBranchPriceForm(next);
  }

  async function handleSaveBranchPrice() {
    if (!selectedProduct) {
      return;
    }

    if (!branchPriceForm.branch_id) {
      await Swal.fire({
        icon: "warning",
        title: "Falta la sede",
        text: "Selecciona una sede para continuar.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    const price = Number(branchPriceForm.sale_price);
    if (!Number.isFinite(price) || price < 0) {
      await Swal.fire({
        icon: "warning",
        title: "Precio invalido",
        text: "El precio especial debe ser mayor o igual a cero.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    setIsSavingBranchPrice(true);

    try {
      const endpoint = branchPriceForm.id
        ? `/api/admin/product-branch-prices/${branchPriceForm.id}`
        : "/api/admin/product-branch-prices";
      const method = branchPriceForm.id ? "PUT" : "POST";
      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(branchPriceForm),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "No se pudo guardar el precio especial.");
      }

      await Swal.fire({
        icon: "success",
        title: branchPriceForm.id ? "Precio actualizado" : "Precio creado",
        text: "La configuracion por sede quedo guardada.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });

      const prices = await loadBranchPrices(selectedProduct.id);
      setBranchPrices(prices);
      setBranchPriceForm(
        buildBranchPriceFormValue(
          selectedProduct.id,
          branchPriceForm.branch_id,
          findBranchPrice(prices, branchPriceForm.branch_id),
        ),
      );
      await loadProducts(selectedBranchId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[products/ui] Error al guardar precio por sede", {
        message,
        productId: selectedProduct.id,
      });
      await Swal.fire({
        icon: "error",
        title: "No se pudo guardar el precio especial",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } finally {
      setIsSavingBranchPrice(false);
    }
  }

  async function toggleBranchPrice(price: ProductBranchPriceRecord) {
    if (!selectedProduct) {
      return;
    }

    const result = await Swal.fire({
      icon: "question",
      title: price.is_active ? "Desactivar precio especial" : "Activar precio especial",
      text: price.is_active
        ? "Al desactivarlo, el sistema volvera a usar el precio base."
        : "El precio especial volvera a usarse para la sede.",
      showCancelButton: true,
      confirmButtonText: price.is_active ? "Desactivar" : "Activar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#0f766e",
      background: "#ffffff",
      color: "#0f172a",
    });

    if (!result.isConfirmed) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/product-branch-prices/${price.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          product_id: price.product_id,
          branch_id: price.branch_id,
          sale_price: price.sale_price,
          is_active: !price.is_active,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "No se pudo cambiar el estado del precio.");
      }

      const prices = await loadBranchPrices(selectedProduct.id);
      setBranchPrices(prices);
      if (branchPriceForm.branch_id === price.branch_id) {
        setBranchPriceForm(
          buildBranchPriceFormValue(
            selectedProduct.id,
            price.branch_id,
            findBranchPrice(prices, price.branch_id),
          ),
        );
      }
      await loadProducts(selectedBranchId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[products/ui] Error al cambiar estado del precio especial", {
        message,
        priceId: price.id,
      });
      await Swal.fire({
        icon: "error",
        title: "No se pudo cambiar el estado del precio",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    }
  }

  async function openStockModal(product: ProductRecord) {
    setSelectedProduct(product);
    setIsStockModalOpen(true);

    try {
      const stockDetails = await loadStockDetails(product.id);
      setStockByBranch(stockDetails.stockByBranch);
      setStockMovements(stockDetails.movements);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[products/ui] Error al abrir stock", { message, productId: product.id });
      await Swal.fire({
        icon: "error",
        title: "No se pudo cargar el stock",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      setIsStockModalOpen(false);
      setSelectedProduct(null);
    }
  }

  function closeStockModal() {
    setIsStockModalOpen(false);
    setStockByBranch([]);
    setStockMovements([]);
    if (!isStockMovementModalOpen) {
      setSelectedProduct(null);
    }
  }

  function openStockMovementModal(branchId?: string) {
    if (!selectedProduct) {
      return;
    }

    setStockMovementForm({
      product_id: selectedProduct.id,
      branch_id: canManageCatalog
        ? branchId ?? selectedBranchId ?? branches[0]?.id ?? ""
        : selectedBranchId,
      movement_type: "purchase",
      quantity: "",
      unit_cost: "",
      notes: "",
    });
    setIsStockMovementModalOpen(true);
  }

  function closeStockMovementModal() {
    setIsStockMovementModalOpen(false);
    setStockMovementForm(emptyStockMovementForm);
  }

  async function handleSaveStockMovement() {
    if (!selectedProduct) {
      return;
    }

    if (!stockMovementForm.branch_id) {
      await Swal.fire({
        icon: "warning",
        title: "Falta la sede",
        text: "Selecciona una sede para registrar el movimiento.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    const quantity = Number(stockMovementForm.quantity);
    if (!Number.isFinite(quantity) || quantity === 0) {
      await Swal.fire({
        icon: "warning",
        title: "Cantidad invalida",
        text: "La cantidad debe ser distinta de cero.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    const unitCost = stockMovementForm.unit_cost.trim()
      ? Number(stockMovementForm.unit_cost)
      : null;

    if (unitCost !== null && (!Number.isFinite(unitCost) || unitCost < 0)) {
      await Swal.fire({
        icon: "warning",
        title: "Costo invalido",
        text: "El costo unitario debe ser mayor o igual a cero.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    setIsSavingStockMovement(true);

    try {
      const response = await fetch("/api/admin/stock-movements", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          product_id: selectedProduct.id,
          branch_id: stockMovementForm.branch_id,
          movement_type: stockMovementForm.movement_type,
          quantity: stockMovementForm.quantity,
          unit_cost: normalizeText(stockMovementForm.unit_cost),
          notes: normalizeText(stockMovementForm.notes),
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "No se pudo registrar el movimiento.");
      }

      await Swal.fire({
        icon: "success",
        title: "Movimiento registrado",
        text: "El stock se actualizo desde el movimiento guardado.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });

      const stockDetails = await loadStockDetails(selectedProduct.id);
      setStockByBranch(stockDetails.stockByBranch);
      setStockMovements(stockDetails.movements);
      await loadProducts(selectedBranchId);
      closeStockMovementModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[products/ui] Error al registrar movimiento", {
        message,
        productId: selectedProduct.id,
      });
      await Swal.fire({
        icon: "error",
        title: "No se pudo registrar el movimiento",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } finally {
      setIsSavingStockMovement(false);
    }
  }

  return (
    <>
      <div className="space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="text-sm font-semibold text-slate-900">Productos y stock</p>
              <p className="mt-1 text-sm text-slate-600">
                Catalogo global con precios por sede y stock calculado desde movimientos.
              </p>
            </div>

            {canManageCatalog ? (
              <Button type="button" onClick={startCreateProduct}>
                <FontAwesomeIcon icon={faPlus} />
                Nuevo producto
              </Button>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="relative block sm:col-span-2 xl:col-span-1">
              <FontAwesomeIcon
                icon={faMagnifyingGlass}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nombre, SKU o codigo..."
                className="pl-10"
              />
            </label>

            <Select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option value="">Todas las categorias</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>

            <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">Todos los estados</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </Select>

            <Select
              value={selectedBranchId}
              disabled={!canManageCatalog}
              onChange={(event) => setSelectedBranchId(event.target.value)}
            >
              <option value="">Ver precio base</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </Select>
          </div>
        </section>

        {isLoading ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-600">Cargando productos...</p>
          </section>
        ) : (
          <ProductsTable
            products={visibleProducts}
            branchName={selectedBranchName}
            onView={openDetailModal}
            onEdit={startEditProduct}
            onManageBranchPrice={openBranchPriceModal}
            onManageStock={openStockModal}
            onToggleActive={toggleProduct}
            canManageCatalog={canManageCatalog}
          />
        )}
      </div>

      <ProductDetailModal
        open={isDetailModalOpen}
        product={selectedProduct}
        onClose={closeDetailModal}
      />

      <ProductFormModal
        open={isProductModalOpen}
        value={productForm}
        categories={categories}
        isSaving={isSavingProduct}
        isEditing={Boolean(editingProductId)}
        onClose={closeProductModal}
        onChange={setProductForm}
        onSubmit={handleSaveProduct}
        onReset={startCreateProduct}
      />

      <ProductBranchPriceModal
        open={isBranchPriceModalOpen}
        product={selectedProduct}
        branches={branches}
        prices={branchPrices}
        value={branchPriceForm}
        isSaving={isSavingBranchPrice}
        onClose={closeBranchPriceModal}
        onChange={handleBranchPriceFormChange}
        onSubmit={handleSaveBranchPrice}
        onToggleActive={toggleBranchPrice}
      />

      <ProductStockModal
        open={isStockModalOpen}
        product={selectedProduct}
        stockByBranch={stockByBranch}
        movements={stockMovements}
        onClose={closeStockModal}
        onCreateMovement={openStockMovementModal}
        canCreateForAllBranches={canManageCatalog}
      />

      <StockMovementFormModal
        open={isStockMovementModalOpen}
        product={selectedProduct}
        branches={branches}
        value={stockMovementForm}
        isSaving={isSavingStockMovement}
        onClose={closeStockMovementModal}
        onChange={setStockMovementForm}
        onSubmit={handleSaveStockMovement}
        receptionMode={!canManageCatalog}
      />
    </>
  );
}
