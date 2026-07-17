import { ModulePlaceholder } from "@/components/ui/ModulePlaceholder";
import { getModuleAccess, renderModuleAccessDenied } from "@/lib/auth/access-server";

export default async function DevicesPage() {
  const access = await getModuleAccess("devices");
  if (!access.allowed) return renderModuleAccessDenied(access.message ?? undefined);

  return <ModulePlaceholder description="Aquí se administrarán los dispositivos operativos vinculados a las sedes." />;
}
