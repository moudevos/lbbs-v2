import { BranchesPanel } from "@/features/branches/branches-panel";
import { getModuleAccess, renderModuleAccessDenied } from "@/lib/auth/access-server";

export default async function SedesPage() {
  const access = await getModuleAccess("branches");
  if (!access.allowed) {
    return renderModuleAccessDenied(access.message ?? undefined);
  }

  return <BranchesPanel />;
}
