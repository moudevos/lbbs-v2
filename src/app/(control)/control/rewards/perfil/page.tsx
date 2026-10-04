import { getModuleAccess, renderModuleAccessDenied } from "@/lib/auth/access-server";
import { RewardsCustomerProfilePageClient } from "@/features/rewards/RewardsCustomerProfilePageClient";

export default async function RewardsCustomerProfilePage() {
  const access = await getModuleAccess("rewards");
  if (!access.allowed) return renderModuleAccessDenied(access.message ?? undefined);
  return <RewardsCustomerProfilePageClient canMigrate />;
}
