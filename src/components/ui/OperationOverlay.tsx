"use client";

export function OperationOverlay({ active, label }: { active: boolean; label: string }) {
  if (!active) return null;
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/40 p-4" role="status" aria-live="assertive"><div className="rounded-2xl bg-white px-6 py-5 text-center shadow-2xl"><div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" /><strong className="block text-slate-950">{label}</strong><span className="mt-1 block text-sm text-slate-500">No cierres esta ventana.</span></div></div>;
}
