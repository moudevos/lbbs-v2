import Link from "next/link";
import { cookies } from "next/headers";

import { AuthCard } from "@/components/auth/AuthCard";
import { PasswordUpdateForm } from "@/features/auth/password-update-form";
import { createClient } from "@/lib/supabase/server";

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const [{ data: userData }, cookieStore] = await Promise.all([supabase.auth.getUser(), cookies()]);
  const validRecovery = Boolean(userData.user) && cookieStore.get("lbbs-password-recovery")?.value === "1";
  if (!validRecovery) return <AuthCard title="Enlace no disponible" description="El enlace de recuperación no es válido o ha vencido."><div className="space-y-3"><Link href="/recuperar-contrasena" className="block rounded-md bg-emerald-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-emerald-500">Solicitar un nuevo enlace</Link><Link href="/login" className="block text-center text-sm font-medium text-sky-700 hover:underline">Volver al login</Link></div></AuthCard>;
  return <AuthCard title="Restablecer contraseña"><PasswordUpdateForm mode="recovery" /></AuthCard>;
}
