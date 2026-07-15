import { PosSessionWorkspace } from "@/features/pos";
import { getModuleAccess, renderModuleAccessDenied } from "@/lib/auth/access-server";

export default async function StandalonePosPage() {
  const access = await getModuleAccess("pos");
  if (!access.allowed) {
    return renderModuleAccessDenied(access.message ?? undefined);
  }

  return <PosSessionWorkspace />;
}
