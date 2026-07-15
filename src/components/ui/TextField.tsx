import type { InputHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
  rightSlot?: ReactNode;
};

export function TextField({
  label,
  hint,
  error,
  rightSlot,
  className,
  ...props
}: TextFieldProps) {
  return (
    <label className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        {rightSlot ? <span>{rightSlot}</span> : null}
      </div>
      <input
        className={cn(
          "h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20",
          error ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500/20" : "",
          className,
        )}
        {...props}
      />
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
    </label>
  );
}
