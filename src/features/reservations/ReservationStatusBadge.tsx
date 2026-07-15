"use client";

import { cn } from "@/lib/utils/cn";
import { reservationStatusLabels } from "@/lib/ui/labels";

import type { ReservationStatus } from "./reservation-types";

const badgeStyles: Record<ReservationStatus, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  contacted: "border-cyan-200 bg-cyan-50 text-cyan-700",
  confirmed: "border-sky-200 bg-sky-50 text-sky-700",
  rescheduled: "border-violet-200 bg-violet-50 text-violet-700",
  checked_in: "border-emerald-200 bg-emerald-50 text-emerald-700",
  completed: "border-emerald-200 bg-emerald-100 text-emerald-800",
  cancelled: "border-rose-200 bg-rose-50 text-rose-700",
  no_show: "border-slate-200 bg-slate-100 text-slate-700",
};

type ReservationStatusBadgeProps = {
  status: ReservationStatus;
};

export function ReservationStatusBadge({ status }: ReservationStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        badgeStyles[status],
      )}
    >
      {reservationStatusLabels[status]}
    </span>
  );
}
