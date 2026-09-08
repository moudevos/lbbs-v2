import { EmployeeSuppliesPageClient } from "@/features/employees/EmployeeSuppliesPageClient";
import { getModuleAccess, renderModuleAccessDenied } from "@/lib/auth/access-server";

export default async function EmployeeSuppliesPage() {
  const access = await getModuleAccess("employee_supplies");
  if (!access.allowed) return renderModuleAccessDenied(access.message ?? undefined);
  return <EmployeeSuppliesPageClient />;
}
