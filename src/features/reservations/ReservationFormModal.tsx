"use client";

import { faFloppyDisk, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { Textarea } from "@/components/ui/textarea";
import type { BranchRecord } from "@/features/branches/types";
import { CustomerSearchBox } from "@/features/reservations/CustomerSearchBox";
import type {
  ReservationCustomerOption,
  ReservationFormValue,
} from "@/features/reservations/reservation-types";
import type { EmployeeRecord } from "@/features/employees/types";
import type { ServiceRecord } from "@/features/services/service-types";
import { useModalDirtyState } from "@/lib/hooks/use-modal-dirty-state";

type ReservationFormModalProps = {
  open: boolean;
  value: ReservationFormValue;
  branches: BranchRecord[];
  barbers: EmployeeRecord[];
  services: ServiceRecord[];
  selectedCustomer: ReservationCustomerOption | null;
  isSaving: boolean;
  isEditing: boolean;
  onClose: () => void;
  onChange: (next: ReservationFormValue) => void;
  onSelectCustomer: (customer: ReservationCustomerOption | null) => void;
  onRequestCreateCustomer: (prefillName?: string) => void;
  onSubmit: () => void;
};

export function ReservationFormModal({
  open,
  value,
  branches,
  barbers,
  services,
  selectedCustomer,
  isSaving,
  isEditing,
  onClose,
  onChange,
  onSelectCustomer,
  onRequestCreateCustomer,
  onSubmit,
}: ReservationFormModalProps) {
  const isDirty = useModalDirtyState(open, {
    ...value,
    customer_id: selectedCustomer?.id ?? "",
  });

  function updateField<K extends keyof ReservationFormValue>(
    key: K,
    nextValue: ReservationFormValue[K],
  ) {
    onChange({ ...value, [key]: nextValue });
  }

  return (
    <Modal
      open={open}
      title={isEditing ? "Editar reserva" : "Nueva reserva"}
      description="Coordina cliente, fecha y seguimiento sin registrar una venta."
      onClose={() => {
        if (!isSaving) {
          onClose();
        }
      }}
      isDirty={isDirty}
      size="xl"
    >
      <div className="space-y-5">
        <section className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Cliente</p>
          </div>
          <CustomerSearchBox
            selectedCustomer={selectedCustomer}
            onSelect={onSelectCustomer}
            onRequestCreate={onRequestCreateCustomer}
          />
        </section>

        <section className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Datos de la cita</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <SelectField
              label="Sede"
              value={value.branch_id}
              onChange={(event) => updateField("branch_id", event.target.value)}
            >
              <option value="">Seleccionar sede</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </SelectField>

            <TextField
              label="Fecha"
              type="date"
              value={value.scheduled_date}
              onChange={(event) => updateField("scheduled_date", event.target.value)}
            />

            <TextField
              label="Hora"
              type="time"
              value={value.scheduled_time}
              onChange={(event) => updateField("scheduled_time", event.target.value)}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <SelectField
              label="Barbero preferido"
              value={value.preferred_barber_id}
              onChange={(event) => updateField("preferred_barber_id", event.target.value)}
            >
              <option value="">Sin preferencia</option>
              {barbers.map((barber) => (
                <option key={barber.id} value={barber.id}>
                  {barber.full_name}
                </option>
              ))}
            </SelectField>

            <SelectField
              label="Servicio de interés"
              value={value.service_interest_id}
              onChange={(event) => updateField("service_interest_id", event.target.value)}
            >
              <option value="">No especificado</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </SelectField>
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Coordinacion</p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Mensaje del cliente</span>
              <Textarea
                value={value.customer_message}
                onChange={(event) => updateField("customer_message", event.target.value)}
                placeholder="Ejemplo: Prefiere coordinar por WhatsApp."
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Notas internas</span>
              <Textarea
                value={value.internal_notes}
                onChange={(event) => updateField("internal_notes", event.target.value)}
                placeholder="Seguimiento interno de recepcion."
              />
            </label>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button type="button" onClick={onSubmit} disabled={isSaving}>
            <FontAwesomeIcon icon={isEditing ? faFloppyDisk : faPlus} />
            {isSaving ? "Guardando..." : isEditing ? "Guardar cambios" : "Crear reserva"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
