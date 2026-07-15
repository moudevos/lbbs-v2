import { cn } from "@/lib/utils/cn";
import { roleLabels } from "@/lib/ui/labels";

type RoleBadgeProps = {
  role: "owner" | "admin" | "reception" | "barber" | "viewer";
};

const styles: Record<RoleBadgeProps["role"], string> = {
  owner: "bg-indigo-100 text-indigo-700 border-indigo-200",
  admin: "bg-sky-100 text-sky-700 border-sky-200",
  reception: "bg-emerald-100 text-emerald-700 border-emerald-200",
  barber: "bg-teal-100 text-teal-700 border-teal-200",
  viewer: "bg-slate-100 text-slate-600 border-slate-200",
};

export function RoleBadge({ role }: RoleBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        styles[role],
      )}
    >
      {roleLabels[role]}
    </span>
  );
}
