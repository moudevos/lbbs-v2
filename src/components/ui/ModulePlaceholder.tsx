type ModulePlaceholderProps = {
  description: string;
  status?: string;
};

export function ModulePlaceholder({ description, status = "Módulo listo para implementación." }: ModulePlaceholderProps) {
  return (
    <section className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-slate-900">{status}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    </section>
  );
}
