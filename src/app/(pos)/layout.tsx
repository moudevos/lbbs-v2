import type { ReactNode } from "react";

type PosLayoutProps = {
  children: ReactNode;
};

export default function PosLayout({ children }: PosLayoutProps) {
  return <div className="min-h-screen w-full overflow-hidden bg-slate-50">{children}</div>;
}
