"use client";

import { cn } from "@/lib/utils/cn";
import { reservationVisualStatusLabels } from "./reservation-presentation";
import type { ReservationVisualStatus } from "./reservation-types";

const badgeStyles: Record<ReservationVisualStatus, string> = {
  scheduled: "border-sky-200 bg-sky-50 text-sky-700",
  attended: "border-emerald-200 bg-emerald-100 text-emerald-800",
  unattended: "border-slate-200 bg-slate-100 text-slate-700",
  cancelled: "border-rose-200 bg-rose-50 text-rose-700",
};

type ReservationStatusBadgeProps = {
  status: ReservationVisualStatus;
};

export function ReservationStatusBadge({ status }: ReservationStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        badgeStyles[status],
      )}
    >
      {reservationVisualStatusLabels[status]}
    </span>
  );
}
