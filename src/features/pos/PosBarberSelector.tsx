"use client";

import { Select } from "@/components/ui/select";
import type { PosEmployeeRecord } from "@/features/pos/pos-types";

type PosBarberSelectorProps = {
  value: string;
  employees: PosEmployeeRecord[];
  required: boolean;
  onChange: (value: string) => void;
};

export function PosBarberSelector({
  value,
  employees,
  required,
  onChange,
}: PosBarberSelectorProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">Barbero</p>
        {required ? (
          <span className="text-[11px] font-medium text-amber-700">Obligatorio</span>
        ) : null}
      </div>
      <Select value={value} onChange={(event) => onChange(event.target.value)} className="h-10">
        <option value="">{required ? "Selecciona un barbero" : "Sin barbero"}</option>
        {employees.map((employee) => (
          <option key={employee.id} value={employee.id}>
            {employee.full_name}
          </option>
        ))}
      </Select>
    </div>
  );
}
