import { NextResponse, type NextRequest } from "next/server";

function hasSupabaseSession(request: NextRequest) {
  return request.cookies.getAll().some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = hasSupabaseSession(request);
  if (pathname.startsWith("/control") && !hasSession) return NextResponse.redirect(new URL("/login", request.url));
  if (pathname === "/login" && hasSession) return NextResponse.redirect(new URL("/control", request.url));
  return NextResponse.next();
}

export const config = { matcher: ["/login", "/control/:path*"] };
