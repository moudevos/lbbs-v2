"use client";

import { useState, type ReactNode } from "react";

import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import type { AppRole } from "@/lib/auth/module-permissions";

type ControlShellProps = {
  children: ReactNode;
  role: AppRole;
};

export function ControlShell({ children, role }: ControlShellProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-stone-100 text-stone-900">
      <Sidebar
        role={role}
        isCollapsed={isSidebarCollapsed}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        onToggleCollapse={() => setIsSidebarCollapsed((value) => !value)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)} />
        <main className="min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,#f8fafc_0%,#eef6fb_100%)] p-4 sm:p-5 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
