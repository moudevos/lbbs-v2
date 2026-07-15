import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { ControlShell } from "@/components/layout/ControlShell";
import { getAccessContext } from "@/lib/auth/access-server";

type ControlLayoutProps = {
  children: ReactNode;
};

export default async function ControlLayout({ children }: ControlLayoutProps) {
  const context = await getAccessContext();

  if (!context) {
    redirect("/login");
  }
  if (context.mustChangePassword) {
    redirect("/cambiar-contrasena-obligatoria");
  }

  return <ControlShell role={context.role}>{children}</ControlShell>;
}
