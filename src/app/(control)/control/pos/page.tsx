import { PosPageClient } from "@/features/pos";
import { getModuleAccess, renderModuleAccessDenied } from "@/lib/auth/access-server";

export default async function PosPage() {
  const access = await getModuleAccess("pos");
  if (!access.allowed) {
    return renderModuleAccessDenied(access.message ?? undefined);
  }

  return <PosPageClient />;
}
