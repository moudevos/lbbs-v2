import { FinancePageClient } from "@/features/finance/FinancePageClient";
import { getModuleAccess, renderModuleAccessDenied } from "@/lib/auth/access-server";

export default async function FinancePage() {
  const access = await getModuleAccess("finance");
  if (!access.allowed) return renderModuleAccessDenied(access.message ?? undefined);
  return <FinancePageClient />;
}
