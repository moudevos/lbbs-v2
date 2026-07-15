import { StatusBadge } from "@/components/feedback/status-badge";

type CustomerStatusBadgeProps = {
  isActive: boolean;
};

export function CustomerStatusBadge({ isActive }: CustomerStatusBadgeProps) {
  return <StatusBadge status={isActive ? "active" : "inactive"} />;
}
