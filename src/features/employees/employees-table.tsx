"use client";

import { faEye, faPenToSquare, faToggleOff, faToggleOn } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { StatusBadge } from "@/components/feedback/status-badge";
import { Button } from "@/components/ui/button";
import { accessLabels } from "@/lib/ui/labels";
import { RoleBadge } from "@/features/employees/role-badge";
import type { EmployeeRecord } from "@/features/employees/types";

type EmployeesTableProps = {
  employees: EmployeeRecord[];
  onEdit: (employee: EmployeeRecord) => void;
  onStatusChange: (employee: EmployeeRecord, status: EmployeeRecord["status"]) => void;
  onView: (employee: EmployeeRecord) => void;
};

export function EmployeesTable({ employees, onEdit, onStatusChange, onView }: EmployeesTableProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Equipo</p>
          <p className="mt-1 text-sm text-slate-600">
            Control de perfiles, roles, sede y estado.
          </p>
        </div>

        <p className="text-sm text-slate-500">{employees.length} empleados</p>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-y-2">
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.2em] text-slate-500">
              <th className="px-3 py-2">Persona</th>
              <th className="px-3 py-2">Sede</th>
              <th className="px-3 py-2">Rol</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Acceso</th>
              <th className="px-3 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => (
              <tr key={employee.id} className="rounded-xl bg-slate-50">
                <td className="px-3 py-3 text-sm text-slate-700">
                  <div className="font-medium text-slate-900">{employee.full_name}</div>
                  <div className="text-xs text-slate-500">
                    {employee.email ?? "Sin email"}
                    {employee.document_number ? ` · ${employee.document_number}` : ""}
                  </div>
                </td>
                <td className="px-3 py-3 text-sm text-slate-700">
                  <div className="font-medium text-slate-900">
                    {employee.branch_name ?? "Sin sede"}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <RoleBadge role={employee.role} />
                </td>
                <td className="px-3 py-3">
                  <StatusBadge status={employee.status} />
                </td>
                <td className="px-3 py-3">
                  <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                    {employee.can_login ? accessLabels.enabled : accessLabels.disabled}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <div className="flex justify-end gap-2">
                    <Button type="button" className="h-9 bg-sky-100 px-3 text-sky-700 hover:bg-sky-200" onClick={() => onView(employee)} title="Ver empleado"><FontAwesomeIcon icon={faEye} /></Button>
                    <Button
                      type="button"
                      className="h-9 bg-slate-100 px-3 text-slate-700 hover:bg-slate-200"
                      onClick={() => onEdit(employee)}
                    >
                      <FontAwesomeIcon icon={faPenToSquare} />
                    </Button>
                    <Button
                      type="button"
                      className={[
                        "h-9 px-3",
                        employee.status === "active"
                          ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                          : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200",
                      ].join(" ")}
                      onClick={() =>
                        onStatusChange(
                          employee,
                          employee.status === "active" ? "inactive" : "active",
                        )
                      }
                    >
                      <FontAwesomeIcon
                        icon={employee.status === "active" ? faToggleOff : faToggleOn}
                      />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}

            {employees.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-500">
                  No hay empleados para mostrar.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
