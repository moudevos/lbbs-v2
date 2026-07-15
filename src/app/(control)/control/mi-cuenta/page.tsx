import { AccountPageClient } from "@/features/auth/AccountPageClient";
import { getModuleAccess, renderModuleAccessDenied } from "@/lib/auth/access-server";

export default async function AccountPage() { const access = await getModuleAccess("control"); if (!access.allowed) return renderModuleAccessDenied(access.message ?? undefined); return <AccountPageClient />; }
