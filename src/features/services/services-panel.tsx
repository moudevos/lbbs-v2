"use client";

import { faMagnifyingGlass, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { BranchRecord } from "@/features/branches/types";
import { ServiceBranchPriceModal } from "@/features/services/ServiceBranchPriceModal";
import { ServiceFormModal } from "@/features/services/ServiceFormModal";
import { ServicesTable } from "@/features/services/ServicesTable";
import type {
  ServiceBranchPriceFormValue,
  ServiceBranchPriceRecord,
  ServiceCategoryRecord,
  ServiceFormValue,
  ServiceRecord,
} from "@/features/services/service-types";

const emptyServiceForm: ServiceFormValue = {
  category_id: "",
  name: "",
  slug: "",
  description: "",
  base_price: "",
  duration_minutes: "",
  allow_custom_price: false,
  is_active: true,
};

const emptyBranchPriceForm: ServiceBranchPriceFormValue = {
  id: "",
  service_id: "",
  branch_id: "",
  price: "",
  is_active: true,
};

function toServiceFormValue(service?: ServiceRecord | null): ServiceFormValue {
  if (!service) {
    return emptyServiceForm;
  }

  return {
    category_id: service.category_id ?? "",
    name: service.name,
    slug: service.slug,
    description: service.description ?? "",
    base_price: service.base_price,
    duration_minutes: String(service.duration_minutes),
    allow_custom_price: service.allow_custom_price,
    is_active: service.is_active,
  };
}

function buildBranchPriceFormValue(
  serviceId: string,
  branchId: string,
  price?: ServiceBranchPriceRecord | null,
): ServiceBranchPriceFormValue {
  if (!price) {
    return {
      id: "",
      service_id: serviceId,
      branch_id: branchId,
      price: "",
      is_active: true,
    };
  }

  return {
    id: price.id,
    service_id: price.service_id,
    branch_id: price.branch_id,
    price: price.price,
    is_active: price.is_active,
  };
}

function findBranchPrice(
  branchPrices: ServiceBranchPriceRecord[],
  branchId: string,
) {
  return branchPrices.find((item) => item.branch_id === branchId) ?? null;
}

function normalizeText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function ServicesPanel() {
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [categories, setCategories] = useState<ServiceCategoryRecord[]>([]);
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [branchPrices, setBranchPrices] = useState<ServiceBranchPriceRecord[]>([]);
  const [search, setSearch] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [serviceForm, setServiceForm] = useState<ServiceFormValue>(emptyServiceForm);
  const [branchPriceForm, setBranchPriceForm] =
    useState<ServiceBranchPriceFormValue>(emptyBranchPriceForm);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<ServiceRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingService, setIsSavingService] = useState(false);
  const [isSavingBranchPrice, setIsSavingBranchPrice] = useState(false);
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [isBranchPriceModalOpen, setIsBranchPriceModalOpen] = useState(false);

  async function loadSupportData() {
    try {
      const [categoriesResponse, branchesResponse] = await Promise.all([
        fetch("/api/admin/service-categories", { cache: "no-store" }),
        fetch("/api/admin/branches", { cache: "no-store" }),
      ]);

      const categoriesPayload = await categoriesResponse.json();
      const branchesPayload = await branchesResponse.json();

      if (!categoriesResponse.ok) {
        throw new Error(
          categoriesPayload.error || "No se pudieron cargar las categorias de servicios.",
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
      console.error("[services/ui] Error al cargar soporte", { message });
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

  async function loadServices(branchId: string) {
    setIsLoading(true);

    try {
      const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
      const response = await fetch(`/api/admin/services${query}`, {
        cache: "no-store",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "No se pudieron cargar los servicios.");
      }

      setServices(payload.data ?? []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[services/ui] Error al cargar servicios", { message, branchId });
      await Swal.fire({
        icon: "error",
        title: "No se pudieron cargar los servicios",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function loadBranchPrices(serviceId: string) {
    const response = await fetch(
      `/api/admin/service-branch-prices?serviceId=${encodeURIComponent(serviceId)}`,
      {
        cache: "no-store",
      },
    );
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "No se pudieron cargar los precios por sede.");
    }

    return payload.data as ServiceBranchPriceRecord[];
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSupportData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadServices(selectedBranchId);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [selectedBranchId]);

  const visibleServices = useMemo(() => {
    const term = search.trim().toLowerCase();

    return services.filter((service) => {
      if (!term) {
        return true;
      }

      return (
        service.name.toLowerCase().includes(term) ||
        service.slug.toLowerCase().includes(term) ||
        (service.category_name ?? "").toLowerCase().includes(term)
      );
    });
  }, [services, search]);

  const selectedBranchName =
    branches.find((branch) => branch.id === selectedBranchId)?.name ?? null;

  function startCreateService() {
    setEditingServiceId(null);
    setServiceForm(emptyServiceForm);
    setIsServiceModalOpen(true);
  }

  function startEditService(service: ServiceRecord) {
    setEditingServiceId(service.id);
    setServiceForm(toServiceFormValue(service));
    setIsServiceModalOpen(true);
  }

  function closeServiceModal() {
    setIsServiceModalOpen(false);
  }

  async function handleSaveService() {
    if (!serviceForm.name.trim() || !serviceForm.slug.trim()) {
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

    const basePrice = Number(serviceForm.base_price);
    const durationMinutes = Number(serviceForm.duration_minutes);

    if (!Number.isFinite(basePrice) || basePrice < 0) {
      await Swal.fire({
        icon: "warning",
        title: "Precio invalido",
        text: "El precio base debe ser mayor o igual a cero.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
      await Swal.fire({
        icon: "warning",
        title: "Duracion invalida",
        text: "La duracion debe ser un numero entero mayor a cero.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    setIsSavingService(true);

    try {
      const payload = {
        category_id: normalizeText(serviceForm.category_id),
        name: serviceForm.name.trim(),
        slug: serviceForm.slug.trim(),
        description: normalizeText(serviceForm.description),
        base_price: serviceForm.base_price,
        duration_minutes: serviceForm.duration_minutes,
        allow_custom_price: serviceForm.allow_custom_price,
        is_active: serviceForm.is_active,
      };

      const response = await fetch(
        editingServiceId ? `/api/admin/services/${editingServiceId}` : "/api/admin/services",
        {
          method: editingServiceId ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "No se pudo guardar el servicio.");
      }

      await Swal.fire({
        icon: "success",
        title: editingServiceId ? "Servicio actualizado" : "Servicio creado",
        text: editingServiceId
          ? "El servicio quedo actualizado."
          : "El servicio quedo registrado.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });

      closeServiceModal();
      setServiceForm(emptyServiceForm);
      setEditingServiceId(null);
      await loadServices(selectedBranchId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[services/ui] Error al guardar servicio", { message });
      await Swal.fire({
        icon: "error",
        title: "No se pudo guardar el servicio",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } finally {
      setIsSavingService(false);
    }
  }

  async function toggleService(service: ServiceRecord) {
    const result = await Swal.fire({
      icon: "question",
      title: service.is_active ? "Desactivar servicio" : "Activar servicio",
      text: service.is_active
        ? "El servicio quedara inactivo hasta que vuelvas a habilitarlo."
        : "El servicio volvera a estar disponible para el catalogo.",
      showCancelButton: true,
      confirmButtonText: service.is_active ? "Desactivar" : "Activar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#0f766e",
      background: "#ffffff",
      color: "#0f172a",
    });

    if (!result.isConfirmed) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/services/${service.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          category_id: service.category_id,
          name: service.name,
          slug: service.slug,
          description: service.description,
          base_price: service.base_price,
          duration_minutes: String(service.duration_minutes),
          allow_custom_price: service.allow_custom_price,
          is_active: !service.is_active,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "No se pudo cambiar el estado del servicio.");
      }

      await loadServices(selectedBranchId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[services/ui] Error al cambiar estado del servicio", { message });
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

  async function openBranchPriceModal(service: ServiceRecord) {
    setSelectedService(service);
    setIsBranchPriceModalOpen(true);

    try {
      const prices = await loadBranchPrices(service.id);
      setBranchPrices(prices);
      const nextBranchId = selectedBranchId || branches[0]?.id || "";
      setBranchPriceForm(
        buildBranchPriceFormValue(
          service.id,
          nextBranchId,
          findBranchPrice(prices, nextBranchId),
        ),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[services/ui] Error al abrir precios por sede", { message, serviceId: service.id });
      await Swal.fire({
        icon: "error",
        title: "No se pudieron cargar los precios por sede",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      setIsBranchPriceModalOpen(false);
      setSelectedService(null);
    }
  }

  function closeBranchPriceModal() {
    setIsBranchPriceModalOpen(false);
    setSelectedService(null);
    setBranchPrices([]);
    setBranchPriceForm(emptyBranchPriceForm);
  }

  function handleBranchPriceFormChange(next: ServiceBranchPriceFormValue) {
    if (next.branch_id !== branchPriceForm.branch_id) {
      const matching = findBranchPrice(branchPrices, next.branch_id);
      setBranchPriceForm(
        buildBranchPriceFormValue(
          selectedService?.id ?? next.service_id,
          next.branch_id,
          matching,
        ),
      );
      return;
    }

    setBranchPriceForm(next);
  }

  async function handleSaveBranchPrice() {
    if (!selectedService) {
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

    const price = Number(branchPriceForm.price);
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
        ? `/api/admin/service-branch-prices/${branchPriceForm.id}`
        : "/api/admin/service-branch-prices";
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

      const prices = await loadBranchPrices(selectedService.id);
      setBranchPrices(prices);
      setBranchPriceForm(
        buildBranchPriceFormValue(
          selectedService.id,
          branchPriceForm.branch_id,
          findBranchPrice(prices, branchPriceForm.branch_id),
        ),
      );
      await loadServices(selectedBranchId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[services/ui] Error al guardar precio por sede", {
        message,
        serviceId: selectedService.id,
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

  async function toggleBranchPrice(price: ServiceBranchPriceRecord) {
    if (!selectedService) {
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
      const response = await fetch(`/api/admin/service-branch-prices/${price.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          service_id: price.service_id,
          branch_id: price.branch_id,
          price: price.price,
          is_active: !price.is_active,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "No se pudo cambiar el estado del precio.");
      }

      const prices = await loadBranchPrices(selectedService.id);
      setBranchPrices(prices);
      if (branchPriceForm.branch_id === price.branch_id) {
        setBranchPriceForm(
          buildBranchPriceFormValue(
            selectedService.id,
            price.branch_id,
            findBranchPrice(prices, price.branch_id),
          ),
        );
      }
      await loadServices(selectedBranchId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[services/ui] Error al cambiar estado del precio especial", {
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

  return (
    <>
      <div className="space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="text-sm font-semibold text-slate-900">Servicios y precios</p>
              <p className="mt-1 text-sm text-slate-600">
                Catalogo global con precio base y precio efectivo por sede.
              </p>
            </div>

            <Button type="button" onClick={startCreateService}>
              <FontAwesomeIcon icon={faPlus} />
              Nuevo servicio
            </Button>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[1.6fr_1fr]">
            <label className="relative block">
              <FontAwesomeIcon
                icon={faMagnifyingGlass}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar servicio o categoria..."
                className="pl-10"
              />
            </label>

            <Select
              value={selectedBranchId}
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

          {categories.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
              No hay categorias de servicios registradas.
            </div>
          ) : null}
        </section>

        {isLoading ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-600">Cargando servicios...</p>
          </section>
        ) : (
          <ServicesTable
            services={visibleServices}
            branchName={selectedBranchName}
            onEdit={startEditService}
            onManageBranchPrice={openBranchPriceModal}
            onToggleActive={toggleService}
          />
        )}
      </div>

      <ServiceFormModal
        open={isServiceModalOpen}
        value={serviceForm}
        categories={categories}
        isSaving={isSavingService}
        isEditing={Boolean(editingServiceId)}
        onClose={closeServiceModal}
        onChange={setServiceForm}
        onSubmit={handleSaveService}
        onReset={startCreateService}
      />

      <ServiceBranchPriceModal
        open={isBranchPriceModalOpen}
        service={selectedService}
        branches={branches}
        prices={branchPrices}
        value={branchPriceForm}
        isSaving={isSavingBranchPrice}
        onClose={closeBranchPriceModal}
        onChange={handleBranchPriceFormChange}
        onSubmit={handleSaveBranchPrice}
        onToggleActive={toggleBranchPrice}
      />
    </>
  );
}
