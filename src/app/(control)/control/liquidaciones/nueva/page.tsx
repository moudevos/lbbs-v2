import { NewSettlementPageClient } from "@/features/settlements/NewSettlementPageClient";
import { getModuleAccess, renderModuleAccessDenied } from "@/lib/auth/access-server";

export default async function NuevaLiquidacionPage() {
  const access = await getModuleAccess("settlements");
  if (!access.allowed) return renderModuleAccessDenied(access.message ?? undefined);
  return <NewSettlementPageClient />;
}
