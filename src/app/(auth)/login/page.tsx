import Image from "next/image";

import { LoginForm } from "@/features/auth/login-form";
import { getDailyVerse } from "@/lib/bible/get-daily-verse";

export default async function LoginPage() {
  const verse = await getDailyVerse();

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(186,230,253,0.55),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(167,243,208,0.4),_transparent_28%),linear-gradient(180deg,#f8fafc_0%,#eef6fb_100%)] px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-md items-center justify-center">
        <section className="w-full overflow-hidden rounded-[32px] border border-white/70 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur sm:p-8">
          <div className="mb-8 flex flex-col items-center text-center">

            <Image
              src="/branch/logobgg.png"
              alt="La Bajadita Barber Studio"
              width={1044}
              height={1044}
              className="mt-6 h-24 w-auto max-w-full object-contain drop-shadow-sm"
              priority
            />

            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              Bienvenido de nuevo
            </h1>
            <p className="mt-1 text-sm italic text-slate-500">
              &ldquo;{verse.text}&rdquo;
              <span className="mt-0.5 block text-xs not-italic text-slate-400">
                {verse.label}
              </span>
            </p>
          </div>

          <LoginForm />

          <p className="mt-4 text-center text-xs text-slate-500">
            #CRISTOVIVE          </p>
        </section>
      </div>
    </main>
  );
}