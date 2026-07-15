import type { SelectHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: string;
  error?: string;
  rightSlot?: ReactNode;
};

export function SelectField({
  label,
  hint,
  error,
  rightSlot,
  className,
  children,
  ...props
}: SelectFieldProps) {
  return (
    <label className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        {rightSlot ? <span>{rightSlot}</span> : null}
      </div>
      <select
        className={cn(
          "h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20",
          error ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500/20" : "",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
    </label>
  );
}
