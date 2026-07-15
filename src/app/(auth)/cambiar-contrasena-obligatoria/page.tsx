import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/AuthCard";
import { PasswordUpdateForm } from "@/features/auth/password-update-form";
import { createClient } from "@/lib/supabase/server";

export default async function ForcedPasswordChangePage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");
  const { data: employee } = await supabase.from("employees").select("must_change_password").eq("user_id", userData.user.id).maybeSingle();
  if (!employee?.must_change_password) redirect("/control");
  return <AuthCard title="Actualiza tu contraseña" description="Por seguridad, debes cambiar la contraseña temporal antes de continuar."><PasswordUpdateForm mode="forced" /></AuthCard>;
}
