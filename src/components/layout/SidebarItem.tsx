// SidebarItem.tsx
import Link from "next/link";
import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { cn } from "@/lib/utils/cn";

type SidebarItemProps = {
  href: string;
  label: string;
  icon: IconDefinition;
  active?: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
  pending?: boolean;
};

export function SidebarItem({
  href,
  label,
  icon,
  active,
  collapsed = false,
  onNavigate,
  pending = false,
}: SidebarItemProps) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-disabled={pending}
      title={collapsed ? label : undefined}
      className={cn(
        "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-bold transition",
        pending && "pointer-events-none opacity-80",
        collapsed ? "justify-center px-2" : "",
        active
          ? "border-amber-400 bg-white text-slate-900 shadow-sm"
          : "border-transparent text-white hover:bg-slate-800",
      )}
    >
      {pending ? <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" aria-label="Cargando modulo" /> : <FontAwesomeIcon icon={icon} className={cn("h-4 w-4 shrink-0", active ? "text-slate-900" : "text-white")} />}
      {!collapsed ? (
        <span className={cn("truncate", active ? "text-slate-900" : "text-white")}>
          {label}
        </span>
      ) : null}
    </Link>
  );
}
