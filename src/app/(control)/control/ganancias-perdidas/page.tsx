import { ProfitLossPageClient } from "@/features/finance/ProfitLossPageClient";
import { getModuleAccess, renderModuleAccessDenied } from "@/lib/auth/access-server";

export default async function ProfitLossPage() {
  const access = await getModuleAccess("profit_loss");
  if (!access.allowed) return renderModuleAccessDenied(access.message ?? undefined);
  return <ProfitLossPageClient />;
}
