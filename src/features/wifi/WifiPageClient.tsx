"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

type Branch = { id: string; name: string; is_active: boolean };
type Voucher = {
  id: string;
  code_last4: string;
  status: string;
  created_at: string;
  first_used_at: string | null;
  unused_expires_at: string;
  session_expires_at: string | null;
  claimed_at: string | null;
  device_mac: string | null;
  device_ip: string | null;
  customer_name: string | null;
  revocation_requested_at: string | null;
  revoke_command_status: string | null;
  archived_at?: string | null;
};
type Router = {
  id: string;
  name: string;
  identifier: string;
  last_seen_at: string | null;
  status: string;
  is_active: boolean;
  routeros_version: string | null;
  model: string | null;
  uptime: string | null;
};

const ONLINE_WINDOW_MS = 90_000;
const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("es-PE", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))
    : "—";

const effectiveVoucherStatus = (voucher: Voucher, now: number) => {
  if (voucher.status === "revoked" || voucher.status === "expired") return voucher.status;
  if (voucher.revocation_requested_at) return voucher.revoke_command_status === "failed" ? "revocation_failed" : "revocation_pending";
  if (voucher.status === "active") {
    return voucher.session_expires_at && new Date(voucher.session_expires_at).getTime() <= now
      ? "expired"
      : "active";
  }
  if (
    !voucher.first_used_at &&
    new Date(voucher.unused_expires_at).getTime() <= now &&
    ["pending_sync", "available", "registration_pending"].includes(voucher.status)
  ) {
    return "expired";
  }
  return voucher.status;
};

function isArchivableVoucher(row: Voucher, now: number) {
  if (row.revocation_requested_at && row.status !== "revoked") return false;
  return row.status === "expired" || row.status === "revoked" ||
    (["available", "registration_pending"].includes(row.status) &&
      !row.first_used_at && new Date(row.unused_expires_at).getTime() <= now);
}

function duration(milliseconds: number) {
  const minutes = Math.max(0, Math.ceil(milliseconds / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
}

const voucherStatus = (status: string) =>
  ({
    pending_sync: "Sincronizando",
    available: "Disponible",
    registration_pending: "Registro pendiente",
    activation_pending: "Esperando activación",
    activation_ready: "Listo para conectar",
    active: "Activo",
    expired: "Expirado",
    revoked: "Revocado",
    sync_error: "Error de sincronización",
    revocation_pending: "Revocación pendiente",
    revocation_failed: "Error al desconectar",
  })[status] ?? status;

function routerStatus(router: Router | null, now: number) {
  if (!router) return "Sin configurar";
  if (!router.is_active || router.status === "disabled") return "Fuera de línea";
  return router.last_seen_at && now - new Date(router.last_seen_at).getTime() <= ONLINE_WINDOW_MS
    ? "En línea"
    : "Fuera de línea";
}

function defaultIdentifier(branchName: string) {
  const normalized = branchName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return `lbbs-${normalized || "sede"}`;
}


type WifiTab = "connected" | "codes" | "history" | "router";
type CodeFilter = "all" | "available" | "in_progress" | "expired" | "revoked";

const statusStyles: Record<string, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-800",
  available: "border-sky-200 bg-sky-50 text-sky-800",
  activation_ready: "border-amber-200 bg-amber-50 text-amber-900",
  activation_pending: "border-amber-200 bg-amber-50 text-amber-900",
  registration_pending: "border-amber-200 bg-amber-50 text-amber-900",
  pending_sync: "border-amber-200 bg-amber-50 text-amber-900",
  expired: "border-slate-200 bg-slate-100 text-slate-600",
  revoked: "border-rose-200 bg-rose-50 text-rose-700",
  sync_error: "border-rose-200 bg-rose-50 text-rose-700",
  revocation_pending: "border-amber-200 bg-amber-50 text-amber-800",
  revocation_failed: "border-rose-200 bg-rose-50 text-rose-800",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span className={"inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold " + (statusStyles[status] ?? "border-slate-200 bg-slate-50 text-slate-700")}>
      {voucherStatus(status)}
    </span>
  );
}

function Metric({
  label,
  value,
  helper,
  variant,
}: {
  label: string;
  value: number;
  helper: string;
  variant: "green" | "blue" | "amber" | "slate";
}) {
  const marker = {
    green: "bg-emerald-500",
    blue: "bg-sky-500",
    amber: "bg-amber-500",
    slate: "bg-slate-400",
  }[variant];
  return (
    <article className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className={"h-2 w-2 rounded-full " + marker} aria-hidden="true" />
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      </div>
      <p className="mt-3 text-3xl font-bold tabular-nums tracking-tight text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{helper}</p>
    </article>
  );
}

export function WifiPageClient() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [rows, setRows] = useState<Voucher[]>([]);
  const [router, setRouter] = useState<Router | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [routerWorking, setRouterWorking] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [routerToken, setRouterToken] = useState<string | null>(null);
  const [routerName, setRouterName] = useState("MikroTik");
  const [routerIdentifier, setRouterIdentifier] = useState("");
  const [error, setError] = useState("");
  const [clock, setClock] = useState(() => Date.now());
  const [tab, setTab] = useState<WifiTab>("connected");
  const [codeFilter, setCodeFilter] = useState<CodeFilter>("all");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [archiveWorkingId, setArchiveWorkingId] = useState<string | null>(null);
  const [archiveWorkingBatch, setArchiveWorkingBatch] = useState(false);
  const [history, setHistory] = useState<Voucher[]>([]);
  const [historyMode, setHistoryMode] = useState<"archived" | "all">("archived");
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyTerm, setHistoryTerm] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [historyDateFrom, setHistoryDateFrom] = useState("");
  const [historyDateTo, setHistoryDateTo] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);

  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.id === branchId) ?? null,
    [branches, branchId],
  );
  const currentRouterStatus = routerStatus(router, clock);
  const derivedRows = useMemo(
    () => rows.map((row) => ({ ...row, effectiveStatus: effectiveVoucherStatus(row, clock) })),
    [rows, clock],
  );
  const connectedRows = derivedRows.filter((row) => row.effectiveStatus === "active");
  const pendingDisconnects = derivedRows.filter((row) => ["revocation_pending", "revocation_failed"].includes(row.effectiveStatus) && Boolean(row.first_used_at));
  const awaitingConfirmation = derivedRows.filter(
    (row) => row.effectiveStatus === "activation_ready" && Boolean(row.device_mac),
  );
  const availableCount = derivedRows.filter((row) => row.effectiveStatus === "available").length;
  const processingCount = derivedRows.filter((row) =>
    ["pending_sync", "registration_pending", "activation_pending", "activation_ready", "revocation_pending"].includes(row.effectiveStatus)
  ).length;
  const endedCount = derivedRows.filter((row) =>
    ["expired", "revoked"].includes(row.effectiveStatus)
  ).length;
  const archivableRows = derivedRows.filter((row) => isArchivableVoucher(row, clock));
  const filteredRows = derivedRows.filter((row) => {
    const inCategory =
      codeFilter === "all" ||
      (codeFilter === "available" && row.effectiveStatus === "available") ||
      (codeFilter === "in_progress" &&
        ["pending_sync", "registration_pending", "activation_pending", "activation_ready", "active", "sync_error", "revocation_pending", "revocation_failed"].includes(row.effectiveStatus)) ||
      (codeFilter === "expired" && row.effectiveStatus === "expired") ||
      (codeFilter === "revoked" && row.effectiveStatus === "revoked");
    const needle = search.trim().toLowerCase();
    const matches = !needle ||
      [row.code_last4, row.customer_name, row.device_mac, row.device_ip]
        .filter(Boolean)
        .some((part) => String(part).toLowerCase().includes(needle));
    return inCategory && matches;
  });

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const loadVouchers = useCallback(async (selectedBranchId: string, signal?: AbortSignal) => {
    if (!selectedBranchId) return;
    const response = await fetch(
      `/api/admin/wifi/vouchers?branchId=${encodeURIComponent(selectedBranchId)}`,
      { cache: "no-store", signal },
    );
    const payload = await response.json();
    if (!response.ok) throw new Error("wifi-load-failed");
    setRows(payload.data ?? []);
    setRouter(payload.router ?? null);
    setLastRefresh(Date.now());
  }, []);

  useEffect(() => {
    void fetch("/api/admin/branches", { cache: "no-store" })
      .then(async (response) => ({ response, payload: await response.json() }))
      .then(({ response, payload }) => {
        if (!response.ok) throw new Error("branches-load-failed");
        const active = (payload.data ?? []).filter((branch: Branch) => branch.is_active);
        setBranches(active);
        if (active.length === 1) setBranchId(active[0].id);
      })
      .catch(() => setError("No se pudo cargar Red Hotspot."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!branchId) return;
    const controller = new AbortController();
    void Promise.resolve()
      .then(() => {
        setLoading(true);
        setCode(null);
        setRouterToken(null);
        setCopied(false);
        setSearch("");
        setCodeFilter("all");
        setHistoryPage(1);
        setHistory([]);
        return loadVouchers(branchId, controller.signal);
      })
      .catch(() => !controller.signal.aborted && setError("No se pudo cargar Red Hotspot."))
      .finally(() => !controller.signal.aborted && setLoading(false));

    const refresh = () => {
      if (!document.hidden) void loadVouchers(branchId).catch(() => undefined);
    };
    const interval = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [branchId, loadVouchers]);

  const loadHistory = useCallback(async (selectedBranchId: string, page = 1) => {
    const params = new URLSearchParams({
      branchId: selectedBranchId,
      page: String(page),
      mode: historyMode,
    });
    if (historySearch) params.set("q", historySearch);
    if (historyDateFrom) params.set("from", historyDateFrom);
    if (historyDateTo) params.set("to", historyDateTo);
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/admin/wifi/vouchers/history?${params}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo consultar el archivo.");
      setHistory(payload.data ?? []);
      setHistoryTotal(payload.total ?? 0);
      setHistoryPage(payload.page ?? page);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo consultar el archivo.");
    } finally {
      setHistoryLoading(false);
    }
  }, [historyMode, historySearch, historyDateFrom, historyDateTo]);

  useEffect(() => {
    if (tab !== "history" || !branchId) return;
    void loadHistory(branchId, historyPage);
  }, [tab, branchId, historyPage, loadHistory]);

  async function archiveAccess(ids: string[], action: "archive" | "restore" | "archive_expired") {
    if (!branchId || archiveWorkingId || archiveWorkingBatch) return;
    if (action === "archive_expired" && !window.confirm("¿Archivar hasta 100 códigos expirados de esta sede? Podrás restaurarlos desde el historial.")) return;
    if (action === "archive" && !window.confirm("¿Ocultar este acceso finalizado de la vista operativa? Se conservará su historial.")) return;

    setError("");
    setNotice("");
    if (action === "archive_expired") setArchiveWorkingBatch(true);
    else setArchiveWorkingId(ids[0] ?? null);
    try {
      const response = await fetch("/api/admin/wifi/vouchers/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchId, action, voucherIds: ids }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo actualizar el archivo.");
      setNotice(
        action === "restore"
          ? `${payload.changed} acceso(s) restaurado(s) a la vista operativa.`
          : `${payload.changed} acceso(s) archivado(s). No se eliminaron datos.`
      );
      await loadVouchers(branchId);
      if (tab === "history") await loadHistory(branchId, historyPage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo actualizar el archivo.");
    } finally {
      setArchiveWorkingId(null);
      setArchiveWorkingBatch(false);
    }
  }

  useEffect(() => {
    if (!selectedBranch || router) return;
    setRouterName(`MikroTik ${selectedBranch.name}`);
    setRouterIdentifier(defaultIdentifier(selectedBranch.name));
  }, [router, selectedBranch]);

  async function generate() {
    if (!branchId) return;
    if (code && !window.confirm("El código anterior dejará de verse en esta pantalla. ¿Ya lo copiaste o anotaste?")) return;
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/admin/wifi/vouchers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo generar el acceso.");
      setCode(payload.data.code);
      setCopied(false);
      setTab("codes");
      await loadVouchers(branchId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo generar el acceso.");
    } finally {
      setWorking(false);
    }
  }

  async function registerRouter() {
    if (!branchId || !routerName.trim() || !routerIdentifier.trim()) return;
    setRouterWorking(true);
    setError("");
    try {
      const response = await fetch("/api/admin/wifi/routers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId,
          name: routerName.trim(),
          identifier: routerIdentifier.trim().toLowerCase(),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo registrar el MikroTik.");
      setRouterToken(payload.token);
      setTab("router");
      await loadVouchers(branchId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo registrar el MikroTik.");
    } finally {
      setRouterWorking(false);
    }
  }

  async function regenerateRouterToken() {
    if (!router) return;
    if (!window.confirm("El token anterior dejará de funcionar inmediatamente. ¿Continuar?")) return;
    setRouterWorking(true);
    setError("");
    try {
      const response = await fetch("/api/admin/wifi/routers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routerId: router.id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo regenerar el token.");
      setRouterToken(payload.token);
      setTab("router");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo regenerar el token.");
    } finally {
      setRouterWorking(false);
    }
  }


  async function revokeVoucher(row: Voucher) {
    if (!branchId || revokingId) return;
    const disconnect = row.status === "active" || !!row.first_used_at;
    const confirmed = window.confirm(
      disconnect
        ? "¿Desconectar este dispositivo ahora? El acceso quedará cancelado y no podrá volver a utilizarse."
        : "¿Anular este código WiFi? No podrá volver a utilizarse y el código completo no se recuperará.",
    );
    if (!confirmed) return;
    setError("");
    setNotice("");
    setRevokingId(row.id);
    try {
      const response = await fetch(`/api/admin/wifi/vouchers/${encodeURIComponent(row.id)}/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchId, reason: disconnect ? "manual_disconnect" : "manual_revoke" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo solicitar la revocación.");
      setNotice(payload.status === "revoked"
        ? "Acceso revocado."
        : "Solicitud enviada. MikroTik confirmará la revocación mediante ACK. Hasta entonces figurará como pendiente.");
      if (code && row.code_last4 === code.slice(-4)) {
        setCode(null);
      }
      await loadVouchers(branchId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo solicitar la revocación.");
    } finally {
      setRevokingId(null);
    }
  }

  async function refreshNow() {
    if (!branchId || refreshing) return;
    setRefreshing(true);
    try {
      await loadVouchers(branchId);
      setClock(Date.now());
      setError("");
    } catch {
      setError("No se pudieron actualizar los datos WiFi. Intenta nuevamente.");
    } finally {
      setRefreshing(false);
    }
  }

  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setError("No se pudo copiar automáticamente. Anota el código antes de cerrar.");
    }
  }

  if (!loading && !branches.length) {
    return (
      <section className="rounded-2xl border bg-white p-6">
        <h1 className="text-2xl font-bold">Red Hotspot</h1>
        <p className="mt-2 text-slate-600">
          No tienes una sede asignada para administrar Red Hotspot.
        </p>
      </section>
    );
  }


  return (
    <section className="space-y-5 pb-8">
      <header className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <path d="M2 8.8a15.5 15.5 0 0 1 20 0" />
                <path d="M5 12a10.5 10.5 0 0 1 14 0" />
                <path d="M8.5 15.3a5.8 5.8 0 0 1 7 0" />
                <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
              </svg>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Control de red</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">WiFi de clientes</h1>
              <p className="mt-1 text-sm text-slate-500">Gestiona las conexiones y los accesos temporales de cada sede.</p>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block min-w-0 text-xs font-semibold text-slate-600 sm:w-64">
              Sede
              <Select
                className="mt-1 h-10"
                value={branchId}
                disabled={branches.length === 1}
                onChange={(event) => setBranchId(event.target.value)}
              >
                <option value="">Selecciona una sede</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </Select>
            </label>
            <button
              type="button"
              disabled={!branchId || refreshing}
              onClick={() => void refreshNow()}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M20 11a8 8 0 0 0-14.6-4.5L3 9" />
                <path d="M3 4v5h5" />
                <path d="M4 13a8 8 0 0 0 14.6 4.5L21 15" />
                <path d="M21 20v-5h-5" />
              </svg>
              {refreshing ? "Actualizando…" : "Actualizar"}
            </button>
          </div>
        </div>
        {router ? (
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
            <span className={"inline-flex items-center gap-2 font-semibold " + (currentRouterStatus === "En línea" ? "text-emerald-700" : "text-amber-700")}>
              <span className={"h-2 w-2 rounded-full " + (currentRouterStatus === "En línea" ? "bg-emerald-500" : "bg-amber-500")} aria-hidden="true" />
              MikroTik · {currentRouterStatus}
            </span>
            <span>{router.name}</span>
            <span>Última comunicación: {date(router.last_seen_at)}</span>
            {lastRefresh ? <span className="sm:ml-auto">Datos actualizados: {date(new Date(lastRefresh).toISOString())}</span> : null}
          </div>
        ) : null}
      </header>

      {notice ? (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{notice}</div>
      ) : null}

      {error ? (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Conexiones confirmadas" value={connectedRows.length} helper="Inicio de sesión registrado" variant="green" />
        <Metric label="Códigos disponibles" value={availableCount} helper="Vigentes y sin utilizar" variant="blue" />
        <Metric label="En preparación" value={processingCount} helper="Pendientes de completar acceso" variant="amber" />
        <Metric label="Finalizados" value={endedCount} helper="Vencidos o revocados" variant="slate" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div role="tablist" aria-label="Administración WiFi" className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50/60 px-3 pt-2 sm:px-5">
          {([
            { id: "connected" as const, label: "Conectados", number: connectedRows.length },
            { id: "codes" as const, label: "Códigos WiFi", number: derivedRows.length },
            { id: "history" as const, label: "Historial y archivo", number: null },
            { id: "router" as const, label: "Configuración MikroTik", number: null },
          ]).map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={"inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition " +
                (tab === item.id
                  ? "border-emerald-600 text-emerald-800"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800")}
            >
              {item.label}
              {item.number !== null ? (
                <span className={"rounded-md px-2 py-0.5 text-xs tabular-nums " + (tab === item.id ? "bg-emerald-50 text-emerald-800" : "bg-slate-200/70 text-slate-600")}>
                  {item.number}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {tab === "connected" ? (
          <section role="tabpanel" aria-label="Conexiones confirmadas" className="p-5 sm:p-6">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Dispositivos conectados</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Sesiones confirmadas por MikroTik. La información se consulta cada 30 segundos, sin interrumpir la conexión.
                </p>
              </div>
              <span className="inline-flex w-fit rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                {connectedRows.length} {connectedRows.length === 1 ? "sesión confirmada" : "sesiones confirmadas"}
              </span>
            </div>

            {pendingDisconnects.length > 0 ? (
              <div role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-semibold">Desconexiones en proceso: {pendingDisconnects.length}</p>
                <div className="mt-2 space-y-2">
                  {pendingDisconnects.map((row) => (
                    <div key={row.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span>{row.customer_name ?? `Acceso ••${row.code_last4}`} · {voucherStatus(row.effectiveStatus)}</span>
                      {row.effectiveStatus === "revocation_failed" ? (
                        <button type="button" disabled={revokingId !== null} onClick={() => void revokeVoucher(row)} className="rounded-md border border-rose-200 bg-white px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Reintentar</button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {awaitingConfirmation.length > 0 ? (
              <div className="mt-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <span className="shrink-0 font-bold" aria-hidden="true">!</span>
                <div>
                  <p className="font-semibold">{awaitingConfirmation.length} {awaitingConfirmation.length === 1 ? "acceso habilitado" : "accesos habilitados"} sin confirmación de inicio de sesión.</p>
                  <p className="mt-1 text-xs leading-5 text-amber-800">
                    El dispositivo ya fue autorizado, pero aún no recibimos su evento LOGIN. Revisa los eventos on-login/on-logout del perfil lbbs-client-profile. Los verás en Códigos WiFi.
                  </p>
                </div>
              </div>
            ) : null}

            {loading ? (
              <p className="py-10 text-center text-sm text-slate-500">Cargando conexiones…</p>
            ) : connectedRows.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-14 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm">
                  <svg width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" aria-hidden="true">
                    <rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" />
                  </svg>
                </div>
                <p className="mt-4 font-semibold text-slate-900">Todavía no hay conexiones confirmadas</p>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                  Cuando el MikroTik informe un inicio de sesión, aparecerá aquí el cliente, su dispositivo y el tiempo disponible.
                </p>
                <button type="button" onClick={() => setTab("codes")} className="mt-4 text-sm font-semibold text-emerald-700 hover:text-emerald-800">
                  Ver códigos WiFi →
                </button>
              </div>
            ) : (
              <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-[800px] w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Cliente</th>
                      <th className="px-4 py-3">Dispositivo</th>
                      <th className="px-4 py-3">Inicio de conexión</th>
                      <th className="px-4 py-3">En línea</th>
                      <th className="px-4 py-3">Tiempo restante</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {connectedRows.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-4">
                          <p className="font-semibold text-slate-900">{row.customer_name ?? "Cliente registrado"}</p>
                          <p className="mt-1 font-mono text-xs text-slate-500">Acceso ·••{row.code_last4}</p>
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-mono text-xs font-semibold text-slate-800">{row.device_mac ?? "MAC no disponible"}</p>
                          <p className="mt-1 text-xs text-slate-500">IP: {row.device_ip ?? "No disponible"}</p>
                        </td>
                        <td className="px-4 py-4 text-slate-700">{date(row.first_used_at)}</td>
                        <td className="px-4 py-4 font-medium text-slate-700">
                          {row.first_used_at ? duration(clock - new Date(row.first_used_at).getTime()) : "—"}
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-bold tabular-nums text-emerald-700">
                            {row.session_expires_at ? duration(new Date(row.session_expires_at).getTime() - clock) : "—"}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">Hasta {date(row.session_expires_at)}</p>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <button type="button" disabled={revokingId !== null} onClick={() => void revokeVoucher(row)} className="inline-flex h-9 items-center justify-center rounded-lg border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50">
                            {revokingId === row.id ? "Solicitando…" : "Desconectar"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-4 text-xs leading-5 text-slate-500">
              El listado refleja los eventos confirmados por el router, no una consulta directa a su tabla de sesiones. Puedes solicitar la desconexión manual. El acceso quedará pendiente hasta recibir el ACK del MikroTik.
            </p>
          </section>
        ) : null}

        {tab === "codes" ? (
          <section role="tabpanel" aria-label="Gestión de códigos WiFi" className="space-y-5 p-5 sm:p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Códigos de acceso</h2>
                <p className="mt-1 text-sm text-slate-500">Emite un código temporal para un único dispositivo y consulta su estado.</p>
              </div>
              <Button
                className="h-10 shrink-0 rounded-lg"
                disabled={!branchId || working || !router || currentRouterStatus !== "En línea"}
                onClick={() => void generate()}
              >
                {working ? "Generando…" : "+ Generar acceso"}
              </Button>
            </div>
            {router && currentRouterStatus !== "En línea" ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                El MikroTik debe estar en línea antes de generar accesos.
              </p>
            ) : null}

            {code ? (
              <article className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-emerald-800">Nuevo código WiFi</p>
                    <p className="mt-2 font-mono text-4xl font-bold tracking-[0.17em] text-slate-950 sm:text-5xl">{code}</p>
                    <p className="mt-3 text-xs text-slate-600">Un dispositivo · 30 minutos para usarlo · 3 horas de conexión</p>
                  </div>
                  <Button onClick={() => void copyCode()} className="h-10 shrink-0 rounded-lg">
                    {copied ? "Copiado" : "Copiar código"}
                  </Button>
                </div>
                <div role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
                  <strong>Guárdalo ahora.</strong> Este código se muestra una sola vez y no se puede recuperar. Si se pierde, tendrás que anular ese acceso y crear uno nuevo.
                </div>
              </article>
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Código de uso único</p>
                  <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Anota o copia el código al generarlo: por seguridad, después solo se muestran sus últimos cuatro dígitos.</p>
                </div>
              </div>
            )}

            <div className="border-t border-slate-100 pt-5">
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
                <div>
                  <h3 className="font-bold text-slate-900">Historial de accesos</h3>
                  <p className="mt-1 text-xs text-slate-500">Se muestran los 100 registros más recientes. El estado vencido considera la fecha real de expiración.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <label className="sr-only" htmlFor="wifi-filter">Filtrar por estado</label>
                  <Select
                    id="wifi-filter"
                    className="h-10 w-full sm:w-44"
                    value={codeFilter}
                    onChange={(event) => setCodeFilter(event.target.value as CodeFilter)}
                  >
                    <option value="all">Todos los estados</option>
                    <option value="available">Disponibles</option>
                    <option value="in_progress">En proceso / uso</option>
                    <option value="expired">Expirados</option>
                    <option value="revoked">Revocados</option>
                  </Select>
                  <label className="sr-only" htmlFor="wifi-search">Buscar código o dispositivo</label>
                  <input
                    id="wifi-search"
                    type="search"
                    placeholder="Código, cliente, MAC o IP"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 sm:w-60"
                  />
                </div>
              </div>
              {loading ? (
                <p className="py-10 text-center text-sm text-slate-500">Cargando códigos…</p>
              ) : filteredRows.length === 0 ? (
                <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center">
                  <p className="font-semibold text-slate-700">No hay accesos para estos filtros</p>
                  <p className="mt-2 text-sm text-slate-500">Prueba otro estado o término de búsqueda.</p>
                </div>
              ) : (
                <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-[920px] w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Código</th>
                        <th className="px-4 py-3">Estado</th>
                        <th className="px-4 py-3">Cliente / dispositivo</th>
                        <th className="px-4 py-3">Creado</th>
                        <th className="px-4 py-3">Primer uso</th>
                        <th className="px-4 py-3">Vence</th>
                        <th className="px-4 py-3">Tiempo restante</th>
                        <th className="px-4 py-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredRows.map((row) => {
                        const expiration = row.session_expires_at ?? row.unused_expires_at;
                        const completed = row.effectiveStatus === "expired" || row.effectiveStatus === "revoked";
                        const meaningfulCountdown = !completed &&
                          (row.effectiveStatus === "available" || row.effectiveStatus === "active") &&
                          (row.effectiveStatus !== "active" || Boolean(row.session_expires_at));
                        return (
                          <tr key={row.id} className="align-top hover:bg-slate-50/70">
                            <td className="px-4 py-4 font-mono font-semibold text-slate-800">••{row.code_last4}</td>
                            <td className="px-4 py-4"><StatusPill status={row.effectiveStatus} /></td>
                            <td className="px-4 py-4">
                              <p className="font-medium text-slate-800">{row.customer_name ?? (row.device_mac ? "Dispositivo identificado" : "Sin asignar")}</p>
                              {row.device_mac ? (
                                <p className="mt-1 font-mono text-xs text-slate-500">{row.device_mac}</p>
                              ) : null}
                              {row.device_ip ? (
                                <p className="mt-1 text-xs text-slate-500">IP: {row.device_ip}</p>
                              ) : null}
                            </td>
                            <td className="px-4 py-4 text-slate-600">{date(row.created_at)}</td>
                            <td className="px-4 py-4 text-slate-600">{date(row.first_used_at)}</td>
                            <td className="px-4 py-4 text-slate-600">{date(expiration)}</td>
                            <td className="px-4 py-4 font-semibold tabular-nums text-slate-800">
                              {meaningfulCountdown ? duration(new Date(expiration).getTime() - clock) : "—"}
                            </td>
                            <td className="px-4 py-4 text-right">
                              {row.effectiveStatus !== "revoked" && row.effectiveStatus !== "expired" &&
                               row.effectiveStatus !== "revocation_pending" ? (
                                <button type="button" disabled={revokingId !== null} onClick={() => void revokeVoucher(row)} className="inline-flex h-9 items-center rounded-lg border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                                  {revokingId === row.id ? "Solicitando…" : row.effectiveStatus === "revocation_failed" ? "Reintentar" : row.effectiveStatus === "active" ? "Desconectar" : "Anular"}
                                </button>
                              ) : row.effectiveStatus === "revocation_pending" ? (
                                <span className="text-xs font-medium text-amber-700">Esperando MikroTik</span>
                              ) : isArchivableVoucher(row, clock) ? (
                                <button type="button" disabled={archiveWorkingId !== null || archiveWorkingBatch} onClick={() => void archiveAccess([row.id], "archive")} className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50">
                                  {archiveWorkingId === row.id ? "Archivando…" : "Archivar"}
                                </button>
                              ) : <span className="text-xs text-slate-400">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-500">Los códigos completos no se recuperan. Archivar solo oculta los accesos finalizados; no desconecta usuarios ni elimina registros.</p>
                <button
                  type="button"
                  disabled={archiveWorkingBatch || archiveWorkingId !== null}
                  onClick={() => void archiveAccess([], "archive_expired")}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  {archiveWorkingBatch ? "Archivando…" : "Archivar vencidos (hasta 100)"}
                </button>
              </div>
            </div>
          </section>
        ) : null}


        {tab === "history" ? (
          <section role="tabpanel" aria-label="Historial WiFi y accesos archivados" className="space-y-5 p-5 sm:p-6">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Historial y archivo de accesos</h2>
              <p className="mt-1 text-sm text-slate-500">
                Consulta y restaura códigos archivados. Archivar nunca elimina registros ni modifica la conexión en el MikroTik.
              </p>
            </div>
            <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-4">
              <label className="text-xs font-semibold text-slate-600">
                Vista
                <Select className="mt-1 h-10" value={historyMode} onChange={(event) => { setHistoryMode(event.target.value as "archived" | "all"); setHistoryPage(1); }}>
                  <option value="archived">Solo archivados</option>
                  <option value="all">Todo el historial</option>
                </Select>
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Desde (creación)
                <input type="date" value={historyDateFrom} onChange={(event) => { setHistoryDateFrom(event.target.value); setHistoryPage(1); }} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Hasta (creación)
                <input type="date" min={historyDateFrom || undefined} value={historyDateTo} onChange={(event) => { setHistoryDateTo(event.target.value); setHistoryPage(1); }} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" />
              </label>
              <form className="text-xs font-semibold text-slate-600" onSubmit={(event) => { event.preventDefault(); setHistorySearch(historyTerm.trim()); setHistoryPage(1); }}>
                <label htmlFor="wifi-history-query">Código (4 dígitos) o MAC</label>
                <div className="mt-1 flex">
                  <input id="wifi-history-query" type="search" value={historyTerm} onChange={(event) => setHistoryTerm(event.target.value)} maxLength={80} placeholder="Buscar…" className="h-10 min-w-0 flex-1 rounded-l-md border border-slate-300 bg-white px-3 text-sm" />
                  <button type="submit" className="rounded-r-md bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-700">Buscar</button>
                </div>
              </form>
            </div>
            {historyLoading ? (
              <p className="py-12 text-center text-sm text-slate-500">Consultando historial…</p>
            ) : history.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-12 text-center">
                <p className="font-semibold text-slate-700">Sin resultados en el historial</p>
                <p className="mt-2 text-sm text-slate-500">Cambia los filtros o archiva accesos vencidos desde Códigos WiFi.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-[840px] w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Código</th>
                      <th className="px-4 py-3">Cliente / dispositivo</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3">Creación</th>
                      <th className="px-4 py-3">Archivado</th>
                      <th className="px-4 py-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {history.map((row) => {
                      const effective = effectiveVoucherStatus(row, clock);
                      return (
                        <tr key={row.id} className="align-top hover:bg-slate-50">
                          <td className="px-4 py-4 font-mono font-semibold text-slate-800">••{row.code_last4}</td>
                          <td className="px-4 py-4">
                            <p className="font-semibold text-slate-800">{row.customer_name ?? "Sin asignar"}</p>
                            <p className="mt-1 font-mono text-xs text-slate-500">{row.device_mac ?? "Sin dispositivo"}</p>
                          </td>
                          <td className="px-4 py-4"><StatusPill status={effective} /></td>
                          <td className="px-4 py-4 text-slate-600">{date(row.created_at)}</td>
                          <td className="px-4 py-4 text-slate-600">{date(row.archived_at ?? null)}</td>
                          <td className="px-4 py-4 text-right">
                            {row.archived_at ? (
                              <button type="button" disabled={archiveWorkingId !== null || archiveWorkingBatch} onClick={() => void archiveAccess([row.id], "restore")} className="h-9 rounded-lg border border-emerald-200 bg-white px-3 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50">
                                {archiveWorkingId === row.id ? "Restaurando…" : "Restaurar"}
                              </button>
                            ) : <span className="text-xs text-slate-400">Visible</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
              <p>{historyTotal} {historyTotal === 1 ? "registro" : "registros"} · Página {historyPage} de {Math.max(1, Math.ceil(historyTotal / 30))}</p>
              <div className="flex gap-2">
                <button type="button" disabled={historyLoading || historyPage <= 1} onClick={() => setHistoryPage((page) => page - 1)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 disabled:opacity-40">Anterior</button>
                <button type="button" disabled={historyLoading || historyPage * 30 >= historyTotal} onClick={() => setHistoryPage((page) => page + 1)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 disabled:opacity-40">Siguiente</button>
              </div>
            </div>
          </section>
        ) : null}

        {tab === "router" ? (
          <section role="tabpanel" aria-label="Configuración del MikroTik" className="space-y-5 p-5 sm:p-6">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Configuración MikroTik</h2>
                <p className="mt-1 text-sm text-slate-500">Información técnica y credenciales de vinculación de la sede.</p>
              </div>
              {router ? (
                <span className={"inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold " +
                  (currentRouterStatus === "En línea"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-amber-200 bg-amber-50 text-amber-800")}>
                  {currentRouterStatus}
                </span>
              ) : null}
            </div>
            {router ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    ["Nombre del router", router.name],
                    ["Identificador", router.identifier],
                    ["Modelo", router.model || "—"],
                    ["Versión RouterOS", router.routeros_version || "—"],
                    ["Última conexión", date(router.last_seen_at)],
                    ["Tiempo encendido", router.uptime || "—"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                      <p className="text-xs font-medium text-slate-500">{label}</p>
                      <p className="mt-2 break-all text-sm font-semibold text-slate-900">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-bold text-amber-950">Seguridad del router</p>
                  <p className="mt-1 max-w-3xl text-xs leading-6 text-amber-900">
                    Regenerar el token invalida inmediatamente la credencial anterior. Después deberás actualizar el token en el MikroTik para que vuelva a sincronizarse.
                  </p>
                  <Button disabled={routerWorking} onClick={() => void regenerateRouterToken()} className="mt-4 h-10 rounded-lg bg-slate-900 hover:bg-slate-800">
                    {routerWorking ? "Procesando…" : "Regenerar token de conexión"}
                  </Button>
                </div>
              </>
            ) : branchId ? (
              <div className="max-w-2xl space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-5">
                <p className="font-semibold text-slate-900">Registrar MikroTik para esta sede</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-slate-700">
                    Nombre del router
                    <input
                      className="mt-2 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                      value={routerName}
                      onChange={(event) => setRouterName(event.target.value)}
                      maxLength={120}
                    />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Identificador
                    <input
                      className="mt-2 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm"
                      value={routerIdentifier}
                      onChange={(event) => setRouterIdentifier(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                      maxLength={63}
                    />
                  </label>
                </div>
                <Button disabled={routerWorking} onClick={() => void registerRouter()} className="h-10 rounded-lg">
                  {routerWorking ? "Registrando…" : "Registrar MikroTik"}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Selecciona una sede para revisar su configuración.</p>
            )}

            {routerToken ? (
              <article className="rounded-xl border border-amber-300 bg-amber-50 p-4">
                <p className="font-bold text-amber-950">Token secreto: cópialo ahora</p>
                <p className="mt-1 text-xs text-amber-900">Esta credencial se muestra una única vez. Guárdala exclusivamente en RouterOS.</p>
                <code className="mt-3 block max-w-full overflow-x-auto rounded-lg border border-amber-200 bg-white p-3 text-sm text-slate-800">
                  {routerToken}
                </code>
                <Button className="mt-3 h-10 rounded-lg" onClick={() => void navigator.clipboard.writeText(routerToken)}>Copiar token</Button>
              </article>
            ) : null}
          </section>
        ) : null}
      </div>
    </section>
  );
}
