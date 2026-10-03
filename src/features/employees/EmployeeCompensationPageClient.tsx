"use client";

import { useEffect, useState } from "react";

import { Select } from "@/components/ui/select";
import { EmployeeCompensationPanel } from "@/features/employees/EmployeeCompensationPanel";

type Employee = { id: string; full_name: string; role: string; status: string };

export function EmployeeCompensationPageClient() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => void (async () => {
      try {
        const response = await fetch("/api/admin/employees", { cache: "no-store" });
        const payload = await response.json();
        if (response.ok) setEmployees((payload.data ?? []).filter((employee: Employee) => employee.status === "active"));
      } finally { setLoading(false); }
    })(), 0);
    return () => window.clearTimeout(timer);
  }, []);
  return <div className="space-y-4"><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold">Compensación del personal</h2><p className="mt-1 text-sm text-slate-600">Configura la vigencia histórica de comisión o fijo antes de la nueva producción.</p><label className="mt-4 block max-w-md space-y-1 text-sm">Empleado<Select value={employeeId} disabled={loading} onChange={(event) => setEmployeeId(event.target.value)}><option value="">Seleccionar empleado</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name} · {employee.role}</option>)}</Select></label></section>{employeeId ? <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><EmployeeCompensationPanel employeeId={employeeId} /></section> : null}</div>;
}
