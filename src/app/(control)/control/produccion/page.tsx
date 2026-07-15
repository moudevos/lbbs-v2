import { ProductionPageClient } from "@/features/production/ProductionPageClient";
import { getModuleAccess, renderModuleAccessDenied } from "@/lib/auth/access-server";

export default async function ProduccionPage() {
  const access = await getModuleAccess("production");
  if (!access.allowed) return renderModuleAccessDenied(access.message ?? undefined);
  return <ProductionPageClient />;
}
