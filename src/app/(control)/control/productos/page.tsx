import { ProductsPanel } from "@/features/products";
import { getModuleAccess, renderModuleAccessDenied } from "@/lib/auth/access-server";

export default async function ProductosPage() {
  const access = await getModuleAccess("products");
  if (!access.allowed) {
    return renderModuleAccessDenied(access.message ?? undefined);
  }

  return (
    <ProductsPanel
      canManageCatalog={access.context?.role !== "reception"}
      canCreateProducts
    />
  );
}
