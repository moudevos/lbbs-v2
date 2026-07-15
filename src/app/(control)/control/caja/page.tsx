import { CashPageClient } from "@/features/cash/CashPageClient";
import { getModuleAccess, renderModuleAccessDenied } from "@/lib/auth/access-server";

export default async function CajaPage() {
  const access = await getModuleAccess("cash");

  if (!access.allowed) {
    return renderModuleAccessDenied(access.message ?? undefined);
  }

  return <CashPageClient />;
}
