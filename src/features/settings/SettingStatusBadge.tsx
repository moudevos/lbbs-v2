import { cn } from "@/lib/utils/cn";

type SettingStatusBadgeProps = {
  active: boolean;
};

export function SettingStatusBadge({ active }: SettingStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex min-w-24 items-center justify-center rounded-full px-3 py-1 text-xs font-semibold",
        active
          ? "bg-emerald-100 text-emerald-700"
          : "bg-slate-200 text-slate-600",
      )}
    >
      {active ? "Activo" : "Inactivo"}
    </span>
  );
}
