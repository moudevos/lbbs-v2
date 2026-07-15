import { StatusBadge } from "@/components/feedback/status-badge";

type ProductStatusBadgeProps = {
  isActive: boolean;
};

export function ProductStatusBadge({ isActive }: ProductStatusBadgeProps) {
  return <StatusBadge status={isActive ? "active" : "inactive"} />;
}
