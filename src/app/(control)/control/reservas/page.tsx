import { ReservationsPanel } from "@/features/reservations/reservations-panel";
import { getModuleAccess, renderModuleAccessDenied } from "@/lib/auth/access-server";

export default async function ReservasPage() {
  const access = await getModuleAccess("reservations");
  if (!access.allowed) {
    return renderModuleAccessDenied(access.message ?? undefined);
  }

  return <ReservationsPanel />;
}
