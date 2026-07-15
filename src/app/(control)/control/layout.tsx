import type { ReactNode } from "react";

import { ControlShell } from "@/components/layout/ControlShell";
import { getAccessContext, renderModuleAccessDenied } from "@/lib/auth/access-server";

type ControlLayoutProps = {
  children: ReactNode;
};

export default async function ControlLayout({ children }: ControlLayoutProps) {
  const context = await getAccessContext();

  if (!context) {
    return renderModuleAccessDenied();
  }

  return <ControlShell role={context.role}>{children}</ControlShell>;
}
