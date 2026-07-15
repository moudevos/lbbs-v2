import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function recalculateCustomerRewardsById(customerId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("recalculate_customer_rewards", {
    p_customer_id: customerId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return Number(data ?? 0);
}

export async function recalculateAllEligibleCustomers() {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("customers")
    .select("id")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const customerIds = (data ?? []).map((item) => item.id).filter(Boolean);
  let recalculated = 0;

  for (const customerId of customerIds) {
    const { error: recalculateError } = await admin.rpc("recalculate_customer_rewards", {
      p_customer_id: customerId,
    });

    if (recalculateError) {
      throw new Error(recalculateError.message);
    }

    recalculated += 1;
  }

  return recalculated;
}
