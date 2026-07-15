import { cn } from "@/lib/utils/cn";

type CashMovementStatusBadgeProps = {
  status: "active" | "cancelled";
};

export function CashMovementStatusBadge({ status }: CashMovementStatusBadgeProps) {
  const active = status === "active";

  return (
    <span
      className={cn(
        "inline-flex min-w-24 items-center justify-center rounded-full px-3 py-1 text-xs font-semibold",
        active ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700",
      )}
    >
      {active ? "Activo" : "Anulado"}
    </span>
  );
}
