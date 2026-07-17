import { ModulePlaceholder } from "@/components/ui/ModulePlaceholder";
import { getModuleAccess, renderModuleAccessDenied } from "@/lib/auth/access-server";

export default async function EmployeeDebtsPage() {
  const access = await getModuleAccess("employee_debts");
  if (!access.allowed) return renderModuleAccessDenied(access.message ?? undefined);

  return (
    <ModulePlaceholder
      status="Consulta disponible en Equipo."
      description="La revisión, registro y pago de deudas ya se gestionan desde Equipo, al abrir el perfil del empleado y seleccionar Cuenta corriente. Esta vista centralizará ese flujo en una siguiente etapa."
    />
  );
}
