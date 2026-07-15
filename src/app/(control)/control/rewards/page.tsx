import { RewardsPageClient } from "@/features/rewards/RewardsPageClient";
import { getModuleAccess, renderModuleAccessDenied } from "@/lib/auth/access-server";

export default async function RewardsPage() {
  const access = await getModuleAccess("rewards");

  if (!access.allowed) {
    return renderModuleAccessDenied(access.message ?? undefined);
  }

  return <RewardsPageClient />;
}
