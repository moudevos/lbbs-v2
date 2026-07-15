import { SettingsPageClient } from "@/features/settings/SettingsPageClient";
import { getModuleAccess, renderModuleAccessDenied } from "@/lib/auth/access-server";

export default async function ConfiguracionPage() {
  const access = await getModuleAccess("settings");

  if (!access.allowed) {
    return renderModuleAccessDenied(access.message ?? undefined);
  }

  return <SettingsPageClient />;
}
