import { FinancialAnalysisPageClient } from "@/features/finance/FinancialAnalysisPageClient";
import {
  getModuleAccess,
  renderModuleAccessDenied,
} from "@/lib/auth/access-server";

export default async function FinancialAnalysisPage() {
  const access = await getModuleAccess("financial_analysis");
  if (!access.allowed)
    return renderModuleAccessDenied(access.message ?? undefined);
  return <FinancialAnalysisPageClient />;
}
