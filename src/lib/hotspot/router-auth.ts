import "server-only";

import { createHash } from "node:crypto";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const ROUTER_ONLINE_WINDOW_MS = 90_000;
export const COMMAND_PROCESSING_TIMEOUT_SECONDS = 120;
export const COMMAND_RETRY_LIMIT = 3;

type Router = {
  id: string;
  branch_id: string;
  status: string;
  is_active: boolean;
  last_seen_at: string | null;
  name: string;
};

export function hashRouterToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function getBearerToken(request: Request) {
  const value = request.headers.get("authorization");
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function authenticateRouter(request: Request) {
  const token = getBearerToken(request);
  if (!token) return { ok: false as const, status: 401 };

  const { data, error } = await getSupabaseAdmin()
    .from("hotspot_routers")
    .select("id,branch_id,status,is_active,last_seen_at,name")
    .eq("token_hash", hashRouterToken(token))
    .maybeSingle();

  if (error || !data) return { ok: false as const, status: 401 };
  const router = data as Router;
  if (!router.is_active || router.status === "disabled") {
    return { ok: false as const, status: 403 };
  }
  return { ok: true as const, router };
}

export function isRouterOnline(lastSeenAt: string | null, now = Date.now()) {
  return !!lastSeenAt && now - new Date(lastSeenAt).getTime() <= ROUTER_ONLINE_WINDOW_MS;
}
