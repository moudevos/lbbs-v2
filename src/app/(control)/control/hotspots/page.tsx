import { ModulePlaceholder } from "@/components/ui/ModulePlaceholder";
import { getModuleAccess, renderModuleAccessDenied } from "@/lib/auth/access-server";

export default async function HotspotsPage() {
  const access = await getModuleAccess("hotspots");
  if (!access.allowed) return renderModuleAccessDenied(access.message ?? undefined);

  return <ModulePlaceholder description="Aquí se administrarán los hotspots y sus configuraciones por sede." />;
}
