import { getModuleAccess, renderModuleAccessDenied } from "@/lib/auth/access-server";
import { WifiStaffPortalPreview } from "@/features/wifi/WifiStaffPortalPreview";

export default async function WifiStaffPreviewPage() {
  const access = await getModuleAccess("hotspots");
  if (!access.allowed) return renderModuleAccessDenied(access.message ?? undefined);
  return <WifiStaffPortalPreview />;
}
