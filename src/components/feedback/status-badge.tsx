import { cn } from "@/lib/utils/cn";
import { statusLabels } from "@/lib/ui/labels";

type StatusBadgeProps = {
  status: "active" | "inactive" | "blocked";
};

const styles: Record<StatusBadgeProps["status"], string> = {
  active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  inactive: "bg-slate-100 text-slate-600 border-slate-200",
  blocked: "bg-rose-100 text-rose-700 border-rose-200",
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        styles[status],
      )}
    >
      {statusLabels[status]}
    </span>
  );
}
