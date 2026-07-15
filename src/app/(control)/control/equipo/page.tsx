import { EmployeesPanel } from "@/features/employees/employees-panel";
import { getModuleAccess, renderModuleAccessDenied } from "@/lib/auth/access-server";

export default async function EquipoPage() {
  const access = await getModuleAccess("employees");
  if (!access.allowed) {
    return renderModuleAccessDenied(access.message ?? undefined);
  }

  return <EmployeesPanel />;
}
