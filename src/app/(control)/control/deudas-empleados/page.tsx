import { EmployeeDebtsPageClient } from "@/features/employees/EmployeeDebtsPageClient";
import { getModuleAccess, renderModuleAccessDenied } from "@/lib/auth/access-server";

export default async function EmployeeDebtsPage() {
  const access = await getModuleAccess("employee_debts");
  if (!access.allowed) return renderModuleAccessDenied(access.message ?? undefined);
  return <EmployeeDebtsPageClient />;
}
