import { SalesPanel } from "@/features/sales/sales-panel";
import { getModuleAccess, renderModuleAccessDenied } from "@/lib/auth/access-server";

export default async function VentasPage() {
  const access = await getModuleAccess("sales");
  if (!access.allowed) {
    return renderModuleAccessDenied(access.message ?? undefined);
  }

  return <SalesPanel />;
}
