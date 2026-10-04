import { CustomerLinkRequestsPanel } from "@/features/customers/CustomerLinkRequestsPanel";
import { getModuleAccess, renderModuleAccessDenied } from "@/lib/auth/access-server";
export default async function VinculacionesPage() { const access = await getModuleAccess("customers"); if (!access.allowed) return renderModuleAccessDenied(access.message ?? undefined); return <CustomerLinkRequestsPanel />; }
