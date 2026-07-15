export default function ControlLoading() {
  return <div className="space-y-4" aria-label="Cargando modulo">
    <div className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-white" />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white" />)}</div>
    <div className="h-72 animate-pulse rounded-2xl border border-slate-200 bg-white" />
  </div>;
}
