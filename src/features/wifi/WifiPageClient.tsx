"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

type Branch = { id: string; name: string; is_active: boolean };
type Voucher = { id: string; code_last4: string; status: string; created_at: string; first_used_at: string | null; unused_expires_at: string; session_expires_at: string | null };
type Router = { id: string; name: string; last_seen_at: string | null; status: string; is_active: boolean };

const ONLINE_WINDOW_MS = 90_000;
const date = (value: string | null) => value ? new Intl.DateTimeFormat("es-PE", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
const voucherStatus = (status: string) => ({ pending_sync: "Sincronizando", available: "Disponible", sync_error: "Error de sincronización" })[status] ?? status;

function routerStatus(router: Router | null) {
  if (!router) return "Sin configurar";
  if (!router.is_active || router.status === "disabled") return "Fuera de línea";
  return router.last_seen_at && Date.now() - new Date(router.last_seen_at).getTime() <= ONLINE_WINDOW_MS ? "En línea" : "Fuera de línea";
}

export function WifiPageClient() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [rows, setRows] = useState<Voucher[]>([]);
  const [router, setRouter] = useState<Router | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState("");
  const loadVouchers = useCallback(async (selectedBranchId: string, signal?: AbortSignal) => {
    if (!selectedBranchId) return;
    const response = await fetch(`/api/admin/wifi/vouchers?branchId=${encodeURIComponent(selectedBranchId)}`, { cache: "no-store", signal });
    const payload = await response.json();
    if (!response.ok) throw new Error("wifi-load-failed");
    setRows(payload.data ?? []);
    setRouter(payload.router ?? null);
  }, []);

  useEffect(() => {
    void fetch("/api/admin/branches", { cache: "no-store" }).then(async (response) => ({ response, payload: await response.json() })).then(({ response, payload }) => {
      if (!response.ok) throw new Error("branches-load-failed");
      const active = (payload.data ?? []).filter((branch: Branch) => branch.is_active);
      setBranches(active);
      if (active.length === 1) setBranchId(active[0].id);
    }).catch(() => setError("No se pudo cargar Red Hotspot.")).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!branchId) return;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      setLoading(true);
      setCode(null);
      return loadVouchers(branchId, controller.signal);
    }).catch(() => !controller.signal.aborted && setError("No se pudo cargar Red Hotspot.")).finally(() => !controller.signal.aborted && setLoading(false));
    const interval = window.setInterval(() => void loadVouchers(branchId).catch(() => undefined), 12_000);
    return () => { controller.abort(); window.clearInterval(interval); };
  }, [branchId, loadVouchers]);

  async function generate() {
    if (!branchId) return;
    setWorking(true); setError("");
    try {
      const response = await fetch("/api/admin/wifi/vouchers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ branchId }) });
      const payload = await response.json();
      if (!response.ok) throw new Error("voucher-generate-failed");
      setCode(payload.data.code);
      await loadVouchers(branchId);
    } catch { setError("No se pudo generar el acceso."); } finally { setWorking(false); }
  }

  if (!loading && !branches.length) return <section className="rounded-2xl border bg-white p-6"><h1 className="text-2xl font-bold">Red Hotspot</h1><p className="mt-2 text-slate-600">No tienes una sede asignada para administrar Red Hotspot.</p></section>;
  return <section className="space-y-5">
    <header><p className="text-xs font-bold tracking-widest text-emerald-700">RED HOTSPOT</p><h1 className="text-2xl font-bold">Accesos WiFi para clientes</h1><label className="mt-4 block max-w-md text-sm font-medium">Sede<Select className="mt-1 w-full" value={branchId} disabled={branches.length === 1} onChange={(event) => setBranchId(event.target.value)}>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</Select></label></header>
    <div className="grid gap-3 sm:grid-cols-4">{[["Router", routerStatus(router)], ["Clientes activos", rows.filter((row) => row.status === "active").length], ["Disponibles", rows.filter((row) => row.status === "available").length], ["Expirados hoy", rows.filter((row) => row.status === "expired").length]].map(([label, value]) => <article key={String(label)} className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">{label}</p><strong>{value}</strong></article>)}</div>
    <article className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">Generar acceso WiFi</h2><p className="mt-1 text-sm text-slate-600">Crea un código temporal para un cliente de esta sede.</p><Button className="mt-4" disabled={!branchId || working} onClick={() => void generate()}>{working ? "Generando acceso…" : "Generar acceso"}</Button></article>
    {code ? <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><p>Acceso WiFi</p><strong className="font-mono text-3xl tracking-widest">{code}</strong><p className="mt-2 text-sm">1 dispositivo · 30 min para primer uso · 3 horas desde primera conexión</p><Button className="mt-3" onClick={() => void navigator.clipboard.writeText(code)}>Copiar código</Button></article> : null}
    {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    <section className="overflow-x-auto rounded-2xl border bg-white p-5"><h2 className="font-semibold">Accesos recientes</h2>{loading ? <p className="mt-3 text-sm text-slate-500">Cargando accesos…</p> : <table className="mt-3 min-w-full text-sm"><thead><tr className="text-left text-slate-500"><th>Código</th><th>Estado</th><th>Creado</th><th>Primer uso</th><th>Expira</th></tr></thead><tbody>{rows.map((row) => <tr className="border-t" key={row.id}><td>***{row.code_last4}</td><td>{voucherStatus(row.status)}</td><td>{date(row.created_at)}</td><td>{date(row.first_used_at)}</td><td>{date(row.session_expires_at ?? row.unused_expires_at)}</td></tr>)}</tbody></table>}</section>
  </section>;
}
