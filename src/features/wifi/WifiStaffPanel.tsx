"use client";

import { useCallback, useEffect, useState } from "react";

type Employee = { id: string; full_name: string; document_type: string | null; document_number: string | null };
type Device = { id: string; mac_address: string; is_authorized: boolean; registered_at: string };
type StaffSession = { id: string; employee_name: string; started_at: string; ended_at: string | null };
type Credential = {
  id: string; employee_id: string; code_last2: string; is_enabled: boolean;
  employee: Employee | null; devices: Device[];
};

export function WifiStaffPanel({ branchId }: { branchId: string }) {
  const [sessions, setSessions] = useState<StaffSession[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [issuedCode, setIssuedCode] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!branchId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/wifi/staff?branchId=${encodeURIComponent(branchId)}`, { cache: "no-store", signal });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo cargar WiFi Staff.");
      if (signal?.aborted) return;
      setEmployees(payload.employees ?? []);
      setCredentials(payload.data ?? []);
      const historyResponse = await fetch("/api/admin/wifi/staff/sessions?branchId=" + encodeURIComponent(branchId), { cache: "no-store", signal });
      if (historyResponse.ok) {
        const history = await historyResponse.json();
        if (!signal?.aborted) setSessions(history.data ?? []);
      }
      setError("");
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "No se pudo cargar WiFi Staff.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    const controller = new AbortController();
    setIssuedCode(null);
    setEmployeeId("");
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function mutate(method: "POST" | "PATCH", body: Record<string, unknown>) {
    setWorking(true);
    setError("");
    setNotice("");
    setIssuedCode(null);
    try {
      const response = await fetch("/api/admin/wifi/staff", {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, branchId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo guardar el cambio.");
      if (typeof payload.code === "string") setIssuedCode(payload.code);
      setNotice(payload.warning ?? "Cambio guardado en el Dashboard. La activación de red requiere la instalación y validación del portal Staff en MikroTik.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el cambio.");
    } finally {
      setWorking(false);
    }
  }

  const existing = new Set(credentials.map(c => c.employee_id));
  const available = employees.filter(e => !existing.has(e.id));

  return (
    <section role="tabpanel" aria-label="WiFi Staff" className="space-y-5 p-5 sm:p-6">
      <div>
        <h2 className="text-lg font-bold text-slate-950">WiFi Staff</h2>
        <p className="mt-1 text-sm text-slate-500">Credenciales del personal por sede. La autorización y las sesiones se preparan en el backend; el portal Staff todavía no está activado en MikroTik.</p>
      </div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Las credenciales creadas aquí todavía no permiten conectarse al WiFi Staff. No se modifican los vouchers de clientes.
      </div>
      {error ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
      {notice ? <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p> : null}
      {issuedCode ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="font-semibold text-amber-950">Código personal generado (visible una sola vez)</p>
          <p className="mt-2 font-mono text-2xl font-bold tracking-widest text-slate-950">{issuedCode}</p>
          <button type="button" className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white" onClick={() => void navigator.clipboard.writeText(issuedCode)}>Copiar código</button>
          <button type="button" className="ml-3 text-sm font-semibold text-slate-700" onClick={() => setIssuedCode(null)}>Ocultar</button>
        </div>
      ) : null}
      <div className="rounded-xl border border-slate-200 p-4">
        <h3 className="font-semibold text-slate-950">Asignar credencial a un empleado</h3>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <select aria-label="Empleado" className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm" value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
            <option value="">Selecciona un empleado activo con DNI o CE</option>
            {available.map(e => <option key={e.id} value={e.id}>{e.full_name} · {e.document_type} {e.document_number}</option>)}
          </select>
          <button type="button" disabled={!employeeId || working || loading} className="h-10 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-50" onClick={() => void mutate("POST", { employeeId })}>Generar código</button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[650px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-600"><tr><th className="p-3">Empleado</th><th className="p-3">Documento</th><th className="p-3">Código</th><th className="p-3">Estado</th><th className="p-3">Dispositivos</th><th className="p-3">Acciones</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {credentials.map(c => (
              <tr key={c.id}>
                <td className="p-3 font-semibold text-slate-900">{c.employee?.full_name ?? "Empleado no disponible"}</td>
                <td className="p-3 text-slate-600">{c.employee?.document_type} {c.employee?.document_number}</td>
                <td className="p-3 font-mono">••••{c.code_last2}</td>
                <td className="p-3">{c.is_enabled ? "Habilitado en Dashboard" : "Deshabilitado"}</td>
                <td className="p-3">
                  <span>{c.devices.filter(d => d.is_authorized).length} / 2</span>
                  {c.devices.filter(d => d.is_authorized).map(d => (
                    <div key={d.id} className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                      <span className="font-mono">{d.mac_address}</span>
                      <button type="button" disabled={working} className="text-rose-700 underline" onClick={() => {
                        if (window.confirm("¿Revocar este dispositivo?")) void mutate("PATCH", { credentialId: c.id, action: "revoke_device", mac: d.mac_address });
                      }}>Revocar</button>
                    </div>
                  ))}
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={working || !c.is_enabled || c.devices.filter(d => d.is_authorized).length >= 2} className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold disabled:opacity-50" onClick={() => {
                      const mac = window.prompt("Dirección MAC del dispositivo (AA:BB:CC:DD:EE:FF):");
                      if (mac) void mutate("PATCH", { credentialId: c.id, action: "register_device", mac });
                    }}>Añadir dispositivo</button>
                    <button type="button" disabled={working} className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold disabled:opacity-50" onClick={() => { if (window.confirm("¿Generar un nuevo código? El anterior dejará de ser válido en el backend.")) void mutate("PATCH", { credentialId: c.id, action: "rotate" }); }}>Rotar</button>
                    <button type="button" disabled={working} className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold disabled:opacity-50" onClick={() => void mutate("PATCH", { credentialId: c.id, action: c.is_enabled ? "disable" : "enable" })}>{c.is_enabled ? "Deshabilitar" : "Habilitar"}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && credentials.length === 0 ? <p className="p-5 text-center text-sm text-slate-500">Todavía no hay credenciales Staff para esta sede.</p> : null}
        {loading ? <p className="p-3 text-sm text-slate-500">Cargando personal…</p> : null}
      </div>
      <div className="rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-950">Sesiones Staff</h3>
          <button type="button" className="text-sm text-emerald-700" onClick={() => void load()}>Actualizar</button>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[550px] text-left text-sm">
            <thead><tr><th className="py-2">Empleado</th><th>Inicio</th><th>Fin</th><th>Estado</th></tr></thead>
            <tbody>{sessions.map(session => (
              <tr key={session.id} className="border-t border-slate-100">
                <td className="py-2">{session.employee_name}</td>
                <td>{new Date(session.started_at).toLocaleString("es-PE")}</td>
                <td>{session.ended_at ? new Date(session.ended_at).toLocaleString("es-PE") : "—"}</td>
                <td>{session.ended_at ? "Finalizada" : "Sin cierre reportado"}</td>
              </tr>
            ))}</tbody>
          </table>
          {!sessions.length ? <p className="py-3 text-sm text-slate-500">Sin sesiones reportadas.</p> : null}
        </div>
      </div>
    </section>
  );
}
