import { ServicesPanel } from "@/features/services/services-panel";
import { getModuleAccess, renderModuleAccessDenied } from "@/lib/auth/access-server";

export default async function ServiciosPage() {
  const access = await getModuleAccess("services");
  if (!access.allowed) {
    return renderModuleAccessDenied(access.message ?? undefined);
  }

  return <ServicesPanel />;
}
