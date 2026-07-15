import { NextResponse } from "next/server";

import { getSafeAuthRedirect } from "@/lib/auth/public-url";
import { createClient } from "@/lib/supabase/server";

const recoveryCookie = "lbbs-password-recovery";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const next = getSafeAuthRedirect(requestUrl.searchParams.get("next"));
  const supabase = await createClient();

  const result = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type === "recovery"
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" })
      : { error: new Error("Callback de recuperación incompleto.") };

  if (result.error) {
    console.warn("[auth/confirm] Enlace de recuperación no válido", { reason: result.error.name });
    const response = NextResponse.redirect(new URL("/restablecer-contrasena?error=invalid-link", requestUrl.origin));
    response.cookies.delete(recoveryCookie);
    return response;
  }

  const response = NextResponse.redirect(new URL(next, requestUrl.origin));
  response.cookies.set({ name: recoveryCookie, value: "1", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 15 * 60 });
  return response;
}
