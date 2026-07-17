import { ControlKpis } from "@/features/control/ControlKpis";
import { getDailyVerse } from "@/lib/bible/get-daily-verse";
import { createClient } from "@/lib/supabase/server";

export default async function ControlPage() {
  const [supabase, verse] = await Promise.all([createClient(), getDailyVerse()]);
  const { data: userData } = await supabase.auth.getUser();
  const { data: employee } = userData.user
    ? await supabase
        .from("employees")
        .select("full_name")
        .eq("user_id", userData.user.id)
        .maybeSingle()
    : { data: null };

  const metadataName =
    typeof userData.user?.user_metadata?.full_name === "string"
      ? userData.user.user_metadata.full_name.trim()
      : "";
  const greetingName = employee?.full_name?.trim() || metadataName || userData.user?.email || "equipo";

  return <ControlKpis greetingName={greetingName} verse={verse} />;
}
