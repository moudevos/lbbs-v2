import { getModuleAccess, renderModuleAccessDenied } from "@/lib/auth/access-server";
import { WifiPageClient } from "@/features/wifi/WifiPageClient";
export default async function WifiPage() { const access=await getModuleAccess("hotspots"); if(!access.allowed)return renderModuleAccessDenied(access.message ?? undefined); return <WifiPageClient />; }
