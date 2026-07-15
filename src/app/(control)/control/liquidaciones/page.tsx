import { SettlementsPageClient } from "@/features/settlements/SettlementsPageClient";
import { getModuleAccess, renderModuleAccessDenied } from "@/lib/auth/access-server";

export default async function LiquidacionesPage() {
  const access = await getModuleAccess("settlements");
  if (!access.allowed) return renderModuleAccessDenied(access.message ?? undefined);
  return <SettlementsPageClient />;
}
