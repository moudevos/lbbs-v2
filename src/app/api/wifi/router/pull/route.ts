import { NextResponse } from "next/server";

import {
  authenticateRouter,
  COMMAND_PROCESSING_TIMEOUT_SECONDS,
} from "@/lib/hotspot/router-auth";
import { decryptVoucherCode } from "@/lib/hotspot/voucher-crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Command = {
  id: string;
  voucher_id: string | null;
  command_type: string;
  payload: Record<string, unknown> | null;
};

export async function POST(request: Request) {
  const authenticated = await authenticateRouter(request);
  if (!authenticated.ok) {
    return NextResponse.json(
      { error: authenticated.status === 401 ? "Router no autorizado." : "Router deshabilitado." },
      { status: authenticated.status },
    );
  }

  const admin = getSupabaseAdmin();
  await admin
    .from("hotspot_routers")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", authenticated.router.id);

  const { data, error } = await admin.rpc("claim_hotspot_router_commands", {
    p_router_id: authenticated.router.id,
    p_limit: 20,
    p_processing_timeout_seconds: COMMAND_PROCESSING_TIMEOUT_SECONDS,
  });
  if (error) {
    console.error("[hotspot/router/pull] No se pudo reclamar comandos", { code: error.code });
    return NextResponse.json({ error: "No se pudieron obtener comandos." }, { status: 500 });
  }

  const claimed = (data ?? []) as Command[];
  const voucherIds = claimed
    .filter((command) => command.command_type === "CREATE_VOUCHER" && command.voucher_id)
    .map((command) => command.voucher_id as string);
  const { data: vouchers, error: voucherError } = voucherIds.length
    ? await admin
        .from("wifi_access_vouchers")
        .select("id,code_ciphertext")
        .in("id", voucherIds)
        .eq("router_id", authenticated.router.id)
    : { data: [], error: null };
  if (voucherError) {
    return NextResponse.json({ error: "No se pudieron preparar comandos." }, { status: 500 });
  }
  const ciphertextByVoucher = new Map(
    (vouchers ?? []).map((voucher) => [voucher.id, voucher.code_ciphertext]),
  );

  try {
    const commands = claimed.map((command) => {
      if (command.command_type !== "CREATE_VOUCHER") {
        return { id: command.id, type: command.command_type, payload: command.payload ?? {} };
      }
      const ciphertext = command.voucher_id
        ? ciphertextByVoucher.get(command.voucher_id)
        : null;
      if (!command.voucher_id || !ciphertext) throw new Error("Missing voucher ciphertext");
      const code = decryptVoucherCode(ciphertext);
      return {
        id: command.id,
        type: "CREATE_VOUCHER",
        voucherId: command.voucher_id,
        username: code,
        password: code,
        disabled: true,
      };
    });
    return NextResponse.json({ commands });
  } catch {
    // Never include plaintext voucher data in failures or logs.
    return NextResponse.json({ error: "No se pudo preparar comandos." }, { status: 500 });
  }
}
