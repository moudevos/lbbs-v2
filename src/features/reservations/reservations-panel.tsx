"use client";

import { faCalendarDay, faFilter, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { BranchRecord } from "@/features/branches/types";
import { CustomerQuickCreateModal } from "@/features/reservations/CustomerQuickCreateModal";
import { ReservationDetailModal } from "@/features/reservations/ReservationDetailModal";
import { ReservationFormModal } from "@/features/reservations/ReservationFormModal";
import { ReservationsTable } from "@/features/reservations/ReservationsTable";
import type {
  ReservationCustomerOption,
  ReservationDetailRecord,
  ReservationFilters,
  ReservationFormValue,
  ReservationRecord,
} from "@/features/reservations/reservation-types";
import type { EmployeeRecord } from "@/features/employees/types";
import type { ServiceRecord } from "@/features/services/service-types";
import type { CustomerFormValue, CustomerRecord } from "@/features/customers/customer-types";
import { normalizeLookupDocument } from "@/lib/utils/document";
import { normalizePhone } from "@/lib/utils/phone";
import { reservationStatusOptions } from "@/lib/ui/labels";
import { buildWhatsAppUrl } from "@/lib/whatsapp/template";

const emptyReservationForm: ReservationFormValue = {
  customer_id: "",
  branch_id: "",
  preferred_barber_id: "",
  service_interest_id: "",
  scheduled_date: "",
  scheduled_time: "",
  status: "pending",
  source: "manual",
  channel: "reception",
  customer_message: "",
  internal_notes: "",
};

const emptyFilters: ReservationFilters = {
  search: "",
  status: "",
  branchId: "",
  scheduledDate: "",
};

const emptyCustomerForm: CustomerFormValue = {
  first_name: "",
  last_name: "",
  business_name: "",
  phone: "",
  email: "",
  document_type: "",
  document_number: "",
  birthdate: "",
  notes: "",
};

function normalizeText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validateQuickCustomerDocument(
  documentType: CustomerFormValue["document_type"],
  documentNumber: string,
) {
  const value = documentNumber.trim();

  if (!documentType || !value) {
    return null;
  }

  if (documentType === "DNI" && !/^\d{8}$/.test(value)) {
    return "El DNI debe tener 8 digitos.";
  }

  if (documentType === "RUC" && !/^\d{11}$/.test(value)) {
    return "El RUC debe tener 11 digitos.";
  }

  return null;
}

function toSelectedCustomer(customer: {
  id: string;
  full_name: string;
  first_name?: string | null;
  last_name?: string | null;
  business_name?: string | null;
  phone: string;
  phone_normalized?: string | null;
  document_type?: string | null;
  document_number?: string | null;
  email?: string | null;
  is_active?: boolean;
}): ReservationCustomerOption {
  return {
    id: customer.id,
    full_name: customer.full_name,
    first_name: customer.first_name ?? null,
    last_name: customer.last_name ?? null,
    business_name: customer.business_name ?? null,
    phone: customer.phone,
    phone_normalized: customer.phone_normalized ?? normalizePhone(customer.phone),
    document_type: customer.document_type as ReservationCustomerOption["document_type"],
    document_number: customer.document_number ?? null,
    email: customer.email ?? null,
    is_active: customer.is_active ?? true,
  };
}

function toReservationFormValue(reservation?: ReservationRecord | null): ReservationFormValue {
  if (!reservation) {
    return emptyReservationForm;
  }

  return {
    customer_id: reservation.customer_id,
    branch_id: reservation.branch_id ?? "",
    preferred_barber_id: reservation.preferred_barber_id ?? "",
    service_interest_id: reservation.service_interest_id ?? "",
    scheduled_date: reservation.scheduled_date ?? "",
    scheduled_time: reservation.scheduled_time ? reservation.scheduled_time.slice(0, 5) : "",
    status: reservation.status,
    source: reservation.source,
    channel: reservation.channel,
    customer_message: reservation.customer_message ?? "",
    internal_notes: reservation.internal_notes ?? "",
  };
}

export function ReservationsPanel() {
  const [reservations, setReservations] = useState<ReservationRecord[]>([]);
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [filters, setFilters] = useState<ReservationFilters>(emptyFilters);
  const [form, setForm] = useState<ReservationFormValue>(emptyReservationForm);
  const [quickCustomerForm, setQuickCustomerForm] = useState<CustomerFormValue>(emptyCustomerForm);
  const [selectedCustomer, setSelectedCustomer] = useState<ReservationCustomerOption | null>(null);
  const [editingReservation, setEditingReservation] = useState<ReservationRecord | null>(null);
  const [detailReservation, setDetailReservation] = useState<ReservationDetailRecord | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingReservation, setIsSavingReservation] = useState(false);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [isUpdatingReservation, setIsUpdatingReservation] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isLookingUpDocument, setIsLookingUpDocument] = useState(false);
  const [isReservationModalOpen, setIsReservationModalOpen] = useState(false);
  const [isQuickCustomerModalOpen, setIsQuickCustomerModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const activeBranches = useMemo(
    () => branches.filter((branch) => branch.is_active),
    [branches],
  );
  const activeBarbers = useMemo(
    () => employees.filter((employee) => employee.role === "barber" && employee.status === "active"),
    [employees],
  );
  const branchBarbers = useMemo(
    () => activeBarbers.filter((employee) => employee.branch_id === form.branch_id),
    [activeBarbers, form.branch_id],
  );
  const activeServices = useMemo(
    () => services.filter((service) => service.is_active),
    [services],
  );

  async function loadSupportData() {
    try {
      const [branchesResponse, employeesResponse, servicesResponse] = await Promise.all([
        fetch("/api/admin/branches", { cache: "no-store" }),
        fetch("/api/admin/employees", { cache: "no-store" }),
        fetch("/api/admin/services", { cache: "no-store" }),
      ]);

      const [branchesPayload, employeesPayload, servicesPayload] = await Promise.all([
        branchesResponse.json(),
        employeesResponse.json(),
        servicesResponse.json(),
      ]);

      if (!branchesResponse.ok) {
        throw new Error(branchesPayload.error || "No se pudieron cargar las sedes.");
      }

      if (!employeesResponse.ok) {
        throw new Error(employeesPayload.error || "No se pudo cargar el equipo.");
      }

      if (!servicesResponse.ok) {
        throw new Error(servicesPayload.error || "No se pudieron cargar los servicios.");
      }

      setBranches(branchesPayload.data ?? []);
      setEmployees(employeesPayload.data ?? []);
      setServices(servicesPayload.data ?? []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[reservations/ui] Error al cargar soporte", { message });
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

  async function loadReservations(nextFilters: ReservationFilters) {
    setIsLoading(true);

    try {
      const params = new URLSearchParams();

      if (nextFilters.search.trim()) {
        params.set("search", nextFilters.search.trim());
      }

      if (nextFilters.status) {
        params.set("status", nextFilters.status);
      }

      if (nextFilters.branchId) {
        params.set("branchId", nextFilters.branchId);
      }

      if (nextFilters.scheduledDate) {
        params.set("scheduledDate", nextFilters.scheduledDate);
      }

      const query = params.toString();
      const response = await fetch(`/api/admin/reservations${query ? `?${query}` : ""}`, {
        cache: "no-store",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "No se pudieron cargar las reservas.");
      }

      setReservations(payload.data ?? []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[reservations/ui] Error al cargar reservas", { message });
      await Swal.fire({
        icon: "error",
        title: "No se pudieron cargar las reservas",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function loadReservationDetail(reservationId: string) {
    const response = await fetch(`/api/admin/reservations/${reservationId}`, {
      cache: "no-store",
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "No se pudo cargar el detalle de la reserva.");
    }

    return payload.data as ReservationDetailRecord;
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSupportData();
      void loadReservations(emptyFilters);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadReservations(filters);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [filters]);

  function updateFilters<K extends keyof ReservationFilters>(
    key: K,
    value: ReservationFilters[K],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function startCreate() {
    setEditingReservation(null);
    setSelectedCustomer(null);
    setForm(emptyReservationForm);
    setIsReservationModalOpen(true);
  }

  function startEdit(reservation: ReservationRecord) {
    setEditingReservation(reservation);
    setSelectedCustomer(
      toSelectedCustomer({
        id: reservation.customer_id,
        full_name: reservation.customer_name,
        phone: reservation.customer_phone,
        phone_normalized: reservation.customer_phone_normalized,
        document_type: reservation.customer_document_type,
        document_number: reservation.customer_document_number,
      }),
    );
    setForm(toReservationFormValue(reservation));
    setIsReservationModalOpen(true);
  }

  async function openDetail(reservation: ReservationRecord) {
    try {
      const detail = await loadReservationDetail(reservation.id);
      setDetailReservation(detail);
      setNoteDraft("");
      setIsDetailModalOpen(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[reservations/ui] Error al cargar detalle", {
        message,
        reservationId: reservation.id,
      });
      await Swal.fire({
        icon: "error",
        title: "No se pudo abrir la reserva",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    }
  }

  function closeReservationModal() {
    setIsReservationModalOpen(false);
  }

  function closeQuickCustomerModal() {
    setIsQuickCustomerModalOpen(false);
  }

  function handleSelectCustomer(customer: ReservationCustomerOption | null) {
    setSelectedCustomer(customer);
    setForm((current) => ({
      ...current,
      customer_id: customer?.id ?? "",
    }));
  }

  function openQuickCustomerModal(prefillName?: string) {
    setQuickCustomerForm({
      ...emptyCustomerForm,
      first_name: prefillName ?? "",
    });
    setIsQuickCustomerModalOpen(true);
  }

  async function handleLookupQuickCustomerDocument() {
    const documentType = quickCustomerForm.document_type;
    const normalizedDocument = normalizeLookupDocument(
      documentType,
      quickCustomerForm.document_number,
    );

    if (documentType !== "DNI" && documentType !== "RUC") {
      return;
    }

    if (documentType === "DNI" && normalizedDocument.length !== 8) {
      await Swal.fire({
        icon: "warning",
        title: "DNI invalido",
        text: "Ingresa un DNI de 8 digitos para consultar.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    if (documentType === "RUC" && normalizedDocument.length !== 11) {
      await Swal.fire({
        icon: "warning",
        title: "RUC invalido",
        text: "Ingresa un RUC de 11 digitos para consultar.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    setIsLookingUpDocument(true);

    try {
      const response = await fetch("/api/customers/lookup-document", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          document_type: documentType,
          document_number: normalizedDocument,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "No se pudo consultar el documento.");
      }

      if (payload.customer) {
        const customer = payload.customer as CustomerRecord;
        setQuickCustomerForm({
          first_name: customer.first_name ?? "",
          last_name: customer.last_name ?? "",
          business_name: customer.business_name ?? "",
          phone: customer.phone,
          email: customer.email ?? "",
          document_type: customer.document_type ?? "",
          document_number: customer.document_number ?? "",
          birthdate: customer.birthdate ?? "",
          notes: customer.notes ?? "",
        });
        return;
      }

      setQuickCustomerForm((current) => ({
        ...current,
        first_name: payload.data?.first_name ?? current.first_name,
        last_name: payload.data?.last_name ?? current.last_name,
        business_name: payload.data?.business_name ?? current.business_name,
        document_type: payload.data?.document_type ?? current.document_type,
        document_number: payload.data?.document_number ?? current.document_number,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[reservations/ui] Error al consultar documento del cliente", { message });
      await Swal.fire({
        icon: "error",
        title: "No se pudo consultar el documento",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } finally {
      setIsLookingUpDocument(false);
    }
  }

  async function handleCreateQuickCustomer() {
    const documentError = validateQuickCustomerDocument(
      quickCustomerForm.document_type,
      quickCustomerForm.document_number,
    );

    if (documentError) {
      await Swal.fire({
        icon: "warning",
        title: "Documento invalido",
        text: documentError,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    const isBusiness = quickCustomerForm.document_type === "RUC";
    const hasValidName = isBusiness
      ? Boolean(quickCustomerForm.business_name.trim())
      : Boolean(quickCustomerForm.first_name.trim());

    if (!hasValidName) {
      await Swal.fire({
        icon: "warning",
        title: "Faltan datos",
        text: isBusiness
          ? "Debes ingresar la razon social del cliente."
          : "Debes ingresar al menos los nombres del cliente.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    const phoneNormalized = normalizePhone(quickCustomerForm.phone);
    if (phoneNormalized.length < 9) {
      await Swal.fire({
        icon: "warning",
        title: "Celular invalido",
        text: "Ingresa un celular con al menos 9 digitos validos.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    if (quickCustomerForm.email.trim() && !isValidEmail(quickCustomerForm.email.trim())) {
      await Swal.fire({
        icon: "warning",
        title: "Correo invalido",
        text: "Ingresa un correo valido o dejalo vacio.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    setIsSavingCustomer(true);

    try {
      const response = await fetch("/api/admin/customers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          first_name: normalizeText(quickCustomerForm.first_name),
          last_name: normalizeText(quickCustomerForm.last_name),
          business_name: normalizeText(quickCustomerForm.business_name),
          phone: quickCustomerForm.phone.trim(),
          email: normalizeText(quickCustomerForm.email),
          document_type: normalizeText(quickCustomerForm.document_type),
          document_number: normalizeText(quickCustomerForm.document_number),
          birthdate: normalizeText(quickCustomerForm.birthdate),
          notes: normalizeText(quickCustomerForm.notes),
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "No se pudo crear el cliente.");
      }

      const createdCustomer = payload.data as CustomerRecord;
      const nextCustomer = toSelectedCustomer(createdCustomer);

      handleSelectCustomer(nextCustomer);
      setQuickCustomerForm(emptyCustomerForm);
      setIsQuickCustomerModalOpen(false);

      await Swal.fire({
        icon: "success",
        title: "Cliente creado",
        text: "El cliente ya quedo seleccionado en la reserva.",
        timer: 1500,
        showConfirmButton: false,
        background: "#ffffff",
        color: "#0f172a",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[reservations/ui] Error al crear cliente rapido", { message });
      await Swal.fire({
        icon: "error",
        title: "No se pudo crear el cliente",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } finally {
      setIsSavingCustomer(false);
    }
  }


  async function handleSaveReservation() {
    if (!selectedCustomer?.id) {
      await Swal.fire({
        icon: "warning",
        title: "Cliente requerido",
        text: "Debes seleccionar un cliente antes de guardar la reserva.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    setIsSavingReservation(true);

    try {
      const response = await fetch(
        editingReservation
          ? `/api/admin/reservations/${editingReservation.id}`
          : "/api/admin/reservations",
        {
          method: editingReservation ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            customer_id: selectedCustomer.id,
            branch_id: normalizeText(form.branch_id),
            preferred_barber_id: normalizeText(form.preferred_barber_id),
            service_interest_id: normalizeText(form.service_interest_id),
            scheduled_date: normalizeText(form.scheduled_date),
            scheduled_time: normalizeText(form.scheduled_time),
            status: form.status,
            source: editingReservation?.source ?? "manual",
            channel: editingReservation?.channel ?? "reception",
            customer_message: normalizeText(form.customer_message),
            internal_notes: normalizeText(form.internal_notes),
          }),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "No se pudo guardar la reserva.");
      }

      closeReservationModal();
      await loadReservations(filters);

      if (detailReservation && detailReservation.id === payload.data.id) {
        const nextDetail = await loadReservationDetail(payload.data.id);
        setDetailReservation(nextDetail);
      }

      await Swal.fire({
        icon: "success",
        title: editingReservation ? "Reserva actualizada" : "Reserva creada",
        timer: 1400,
        showConfirmButton: false,
        background: "#ffffff",
        color: "#0f172a",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[reservations/ui] Error al guardar reserva", { message });
      await Swal.fire({
        icon: "error",
        title: "No se pudo guardar la reserva",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } finally {
      setIsSavingReservation(false);
    }
  }

  async function handlePassToSale() {
    if (!detailReservation) return;
    setIsUpdatingReservation(true);
    try {
      const response = await fetch(`/api/admin/reservations/${detailReservation.id}/pos`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) {
        if (payload.code === "POS_SESSION_REQUIRED") {
          const result = await Swal.fire({ icon: "info", title: "Sesion POS requerida", text: payload.error, showCancelButton: true, confirmButtonText: "Ir a POS", cancelButtonText: "Cancelar", confirmButtonColor: "#0f766e", background: "#ffffff", color: "#0f172a" });
          if (result.isConfirmed) window.open("/control/pos", "_blank", "noopener,noreferrer");
          return;
        }
        throw new Error(payload.error || "No se pudo preparar la venta.");
      }
      window.open(`/pos?session_id=${encodeURIComponent(payload.data.sessionId)}&reservation_id=${encodeURIComponent(payload.data.reservationId)}`, "_blank", "noopener,noreferrer");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo preparar la venta.";
      console.error("[reservations/ui] Error al pasar a venta", { message, reservationId: detailReservation.id });
      await Swal.fire({ icon: "error", title: "No se pudo pasar a venta", text: message, confirmButtonColor: "#0f766e", background: "#ffffff", color: "#0f172a" });
    } finally { setIsUpdatingReservation(false); }
  }

  async function handleStatusChange(status: ReservationFormValue["status"]) {
    if (!detailReservation) return;
    let scheduledDate = detailReservation.scheduled_date;
    let scheduledTime = detailReservation.scheduled_time;
    let reason: string | null = null;
    if (status === "rescheduled") {
      const result = await Swal.fire({ title: "Reprogramar reserva", html: '<input id="reservation-date" type="date" class="swal2-input"><input id="reservation-time" type="time" class="swal2-input">', showCancelButton: true, confirmButtonText: "Reprogramar", cancelButtonText: "Cancelar", confirmButtonColor: "#0f766e", preConfirm: () => { const date=(document.getElementById("reservation-date") as HTMLInputElement)?.value; const time=(document.getElementById("reservation-time") as HTMLInputElement)?.value; if(!date||!time){Swal.showValidationMessage("Selecciona fecha y hora.");return false;} return {date,time}; } });
      if (!result.isConfirmed || !result.value) return;
      scheduledDate = result.value.date; scheduledTime = result.value.time;
    }
    if (status === "cancelled" || status === "no_show") {
      const result = await Swal.fire({ title: status === "cancelled" ? "Cancelar reserva" : "Marcar no asistencia", input: "textarea", inputLabel: "Motivo obligatorio", showCancelButton: true, confirmButtonText: "Confirmar", cancelButtonText: "Volver", confirmButtonColor: "#dc2626", inputValidator: (value) => value.trim() ? undefined : "Ingresa el motivo." });
      if (!result.isConfirmed) return;
      reason = result.value;
    }
    setIsUpdatingReservation(true);
    try {
      const response = await fetch(`/api/admin/reservations/${detailReservation.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customer_id: detailReservation.customer_id, branch_id: detailReservation.branch_id, preferred_barber_id: detailReservation.preferred_barber_id, service_interest_id: detailReservation.service_interest_id, scheduled_date: scheduledDate, scheduled_time: scheduledTime, status, source: detailReservation.source, channel: detailReservation.channel, customer_message: detailReservation.customer_message, internal_notes: reason ? [detailReservation.internal_notes, reason].filter(Boolean).join("\n") : detailReservation.internal_notes }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "No se pudo actualizar la reserva.");
      const nextDetail = await loadReservationDetail(detailReservation.id); setDetailReservation(nextDetail);
      setReservations((current) => current.map((item) => item.id === payload.data.id ? { ...item, ...payload.data } : item));
      await Swal.fire({ icon:"success", title:"Reserva actualizada", timer:1200, showConfirmButton:false });
    } catch (error) { const message=error instanceof Error?error.message:"No se pudo actualizar la reserva."; console.error("[reservations/ui] Error al cambiar estado",{message,reservationId:detailReservation.id}); await Swal.fire({icon:"error",title:"No se pudo actualizar",text:message,confirmButtonColor:"#0f766e"}); } finally { setIsUpdatingReservation(false); }
  }

  async function handleContactReservation() {
    if (!detailReservation) return;
    try {
      const response = await fetch(`/api/admin/reservations/${detailReservation.id}/contact`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo preparar el contacto.");
      window.open(buildWhatsAppUrl(payload.data.phone, payload.data.message), "_blank", "noopener,noreferrer");
      await fetch("/api/admin/contacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerId: payload.data.customerId, branchId: payload.data.branchId, reservationId: detailReservation.id, contactType: "reservation_reminder", templateId: payload.data.templateId, phone: payload.data.phone, message: payload.data.message, status: "opened" }) });
      const result = await Swal.fire({ icon: "question", title: "Contacto abierto", text: "WhatsApp se abrio con el mensaje prellenado. ¿Deseas marcar la reserva como contactada?", showCancelButton: true, confirmButtonText: "Marcar contactada", cancelButtonText: "No cambiar estado", confirmButtonColor: "#0f766e" });
      if (result.isConfirmed) await handleStatusChange("contacted");
    } catch (error) { const message=error instanceof Error?error.message:"No se pudo preparar el contacto.";console.error("[reservations/ui] Error al contactar",{message,reservationId:detailReservation.id});await Swal.fire({icon:"error",title:"No se pudo abrir WhatsApp",text:message,confirmButtonColor:"#0f766e"}); }
  }

  async function handleAddNote() {
    if (!detailReservation) {
      return;
    }

    if (!noteDraft.trim()) {
      await Swal.fire({
        icon: "warning",
        title: "Nota vacia",
        text: "Escribe una nota antes de guardarla.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
      return;
    }

    setIsSavingNote(true);

    try {
      const response = await fetch(`/api/admin/reservations/${detailReservation.id}/notes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ note: noteDraft.trim() }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "No se pudo registrar la nota.");
      }

      setDetailReservation((current) =>
        current
          ? {
              ...current,
              notes: [payload.data, ...current.notes],
              notes_count: current.notes_count + 1,
            }
          : current,
      );
      setNoteDraft("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[reservations/ui] Error al guardar nota", { message });
      await Swal.fire({
        icon: "error",
        title: "No se pudo registrar la nota",
        text: message,
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } finally {
      setIsSavingNote(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-2">
              <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                <FontAwesomeIcon icon={faFilter} className="text-slate-400" />
                Buscar
              </span>
              <Input
                value={filters.search}
                onChange={(event) => updateFilters("search", event.target.value)}
                placeholder="Cliente, celular, documento o barbero"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Estado</span>
              <Select
                value={filters.status}
                onChange={(event) => updateFilters("status", event.target.value)}
              >
                <option value="">Todos</option>
                {reservationStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Sede</span>
              <Select
                value={filters.branchId}
                onChange={(event) => updateFilters("branchId", event.target.value)}
              >
                <option value="">Todas</option>
                {activeBranches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            </label>

            <label className="space-y-2">
              <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                <FontAwesomeIcon icon={faCalendarDay} className="text-slate-400" />
                Fecha
              </span>
              <Input
                type="date"
                value={filters.scheduledDate}
                onChange={(event) => updateFilters("scheduledDate", event.target.value)}
              />
            </label>
          </div>

          <Button type="button" onClick={startCreate}>
            <FontAwesomeIcon icon={faPlus} />
            Nueva reserva
          </Button>
        </div>
      </section>

      {isLoading ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          Cargando reservas...
        </section>
      ) : (
        <ReservationsTable reservations={reservations} onView={openDetail} onEdit={startEdit} />
      )}

      <ReservationFormModal
        open={isReservationModalOpen}
        value={form}
        branches={activeBranches}
        barbers={branchBarbers}
        services={activeServices}
        selectedCustomer={selectedCustomer}
        isSaving={isSavingReservation}
        isEditing={Boolean(editingReservation)}
        onClose={closeReservationModal}
        onChange={(next) => setForm((current) => ({
          ...next,
          preferred_barber_id: next.branch_id !== current.branch_id ? "" : next.preferred_barber_id,
        }))}
        onSelectCustomer={handleSelectCustomer}
        onRequestCreateCustomer={openQuickCustomerModal}
        onSubmit={handleSaveReservation}
      />

      <CustomerQuickCreateModal
        open={isQuickCustomerModalOpen}
        value={quickCustomerForm}
        isSaving={isSavingCustomer}
        isLookingUpDocument={isLookingUpDocument}
        onClose={closeQuickCustomerModal}
        onChange={setQuickCustomerForm}
        onLookupDocument={handleLookupQuickCustomerDocument}
        onSubmit={handleCreateQuickCustomer}
        onReset={() => setQuickCustomerForm(emptyCustomerForm)}
      />

      <ReservationDetailModal
        open={isDetailModalOpen}
        reservation={detailReservation}
        noteDraft={noteDraft}
        isSavingNote={isSavingNote}
        isActionBusy={isUpdatingReservation}
        onPassToSale={handlePassToSale}
        onContact={() => { void handleContactReservation(); }}
        onStatusChange={(status) => { void handleStatusChange(status); }}
        onClose={() => setIsDetailModalOpen(false)}
        onEdit={() => {
          if (!detailReservation) {
            return;
          }

          setIsDetailModalOpen(false);
          startEdit(detailReservation);
        }}
        onChangeNoteDraft={setNoteDraft}
        onSubmitNote={handleAddNote}
      />
    </div>
  );
}
