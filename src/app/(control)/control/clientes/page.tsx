import { CustomersPanel } from "@/features/customers/customers-panel";
import { getModuleAccess, renderModuleAccessDenied } from "@/lib/auth/access-server";

export default async function ClientesPage() {
  const access = await getModuleAccess("customers");
  if (!access.allowed) {
    return renderModuleAccessDenied(access.message ?? undefined);
  }

  return <CustomersPanel />;
}
