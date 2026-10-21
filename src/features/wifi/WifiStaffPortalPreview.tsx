"use client";
import { useState } from "react";

const views = [
  { filename: "login.html", title: "Ingreso", description: "Documento y código personal; validación local del formulario" },
  { filename: "alogin.html", title: "Conectando", description: "Transición visual tras autenticarse" },
  { filename: "status.html", title: "Sesión activa", description: "Información de red y cierre de sesión" },
  { filename: "error.html", title: "Error", description: "Error de autenticación" },
  { filename: "logout.html", title: "Desconectado", description: "Confirmación del cierre" },
] as const;

export function WifiStaffPortalPreview() {
  const [current, setCurrent] = useState<(typeof views)[number]["filename"]>("login.html");
  const active = views.find((view) => view.filename === current) ?? views[0];
  return (
    <section className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <a className="text-sm text-emerald-700 underline" href="/control/wifi">← Volver a WiFi</a>
          <h1 className="mt-2 text-2xl font-bold text-slate-950">Portal cautivo WiFi Staff</h1>
          <p className="mt-1 text-sm text-slate-600">
            Diseño original recuperado de la rama de infraestructura. Vista previa, no una conexión real.
          </p>
        </div>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">Solo demostración</span>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Pantallas del portal Staff">
        {views.map(view => (
          <button
            type="button"
            key={view.filename}
            role="tab"
            aria-selected={current === view.filename}
            onClick={() => setCurrent(view.filename)}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold ${current===view.filename?"border-emerald-700 bg-emerald-700 text-white":"border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
          >{view.title}</button>
        ))}
      </div>
      <p className="text-sm text-slate-500">{active.description}. Los valores de sesión son ilustrativos.</p>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-[#0c0c0d] shadow-sm">
        <iframe
          key={current}
          title={`Vista previa Staff: ${active.title}`}
          src={`/wifi-staff-preview/${current}`}
          sandbox="allow-scripts"
          className="h-[680px] w-full border-0 sm:h-[740px]"
        />
      </div>
      <p className="text-xs text-slate-500">
        El portal operativo está en routeros/hotspot/portal/lbbs-cautive-staff/. Esta vista previa no envía documentos ni códigos a MikroTik o Supabase.
      </p>
    </section>
  );
}
