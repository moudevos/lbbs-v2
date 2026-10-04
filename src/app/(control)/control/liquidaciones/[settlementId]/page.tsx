import { SettlementDetailPageClient } from "@/features/settlements/SettlementDetailPageClient";
import { getModuleAccess, renderModuleAccessDenied } from "@/lib/auth/access-server";

export default async function LiquidacionDetallePage({ params }: { params: Promise<{ settlementId: string }> }) {
  const access = await getModuleAccess("settlements");
  if (!access.allowed) return renderModuleAccessDenied(access.message ?? undefined);
  const { settlementId } = await params;
  return <SettlementDetailPageClient settlementId={settlementId} />;
}
