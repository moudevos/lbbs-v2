import Image from "next/image";
import type { ReactNode } from "react";

export function AuthCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(186,230,253,0.55),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(167,243,208,0.4),_transparent_28%),linear-gradient(180deg,#f8fafc_0%,#eef6fb_100%)] px-4 py-6 text-slate-900 sm:px-6"><div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-md items-center justify-center"><section className="w-full rounded-[32px] border border-white/70 bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur sm:p-8"><div className="mb-7 text-center"><Image src="/branch/logobgg.png" alt="La Bajadita Barber Studio" width={1044} height={1044} className="mx-auto h-20 w-auto max-w-full object-contain drop-shadow-sm" priority /><h1 className="mt-4 text-xl font-semibold text-slate-900">{title}</h1>{description ? <p className="mt-2 text-sm text-slate-500">{description}</p> : null}</div>{children}</section></div></main>;
}
