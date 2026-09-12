import { SalesControlPageClient } from "@/features/sales-control/SalesControlPageClient";
import { getModuleAccess, renderModuleAccessDenied } from "@/lib/auth/access-server";

export default async function SalesControlPage() {
  const access = await getModuleAccess("sales_control");
  if (!access.allowed) return renderModuleAccessDenied(access.message ?? undefined);
  return <SalesControlPageClient />;
}
