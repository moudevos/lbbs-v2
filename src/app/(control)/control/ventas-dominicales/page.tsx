import { SundaySalesPageClient } from "@/features/sunday-sales/SundaySalesPageClient";
import { getModuleAccess, renderModuleAccessDenied } from "@/lib/auth/access-server";

export default async function SundaySalesPage() {
  const access = await getModuleAccess("sunday_sales");
  if (!access.allowed) return renderModuleAccessDenied(access.message ?? undefined);
  return <SundaySalesPageClient />;
}
