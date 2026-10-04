import { FinancialAnalysisV2PageClient } from "@/features/finance/FinancialAnalysisV2PageClient";
import { getModuleAccess, renderModuleAccessDenied } from "@/lib/auth/access-server";
export default async function FinancialAnalysisV2Page() { const access = await getModuleAccess("financial_analysis"); return access.allowed ? <FinancialAnalysisV2PageClient /> : renderModuleAccessDenied(access.message ?? undefined); }
