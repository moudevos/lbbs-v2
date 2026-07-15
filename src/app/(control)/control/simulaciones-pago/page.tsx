import { PaymentSimulationsPageClient } from "@/features/payment-simulations/PaymentSimulationsPageClient";
import { getModuleAccess, renderModuleAccessDenied } from "@/lib/auth/access-server";

export default async function PaymentSimulationsPage() {
  const access = await getModuleAccess("payment_simulations");
  if (!access.allowed) return renderModuleAccessDenied(access.message ?? undefined);
  return <PaymentSimulationsPageClient />;
}
