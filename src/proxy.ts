import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function clearAuthCookies(request: NextRequest, response: NextResponse) {
  request.cookies
    .getAll()
    .filter((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"))
    .forEach((cookie) => {
      response.cookies.set(cookie.name, "", { maxAge: 0, path: "/" });
    });
}

function copyCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach(({ name, value, ...options }) => {
    target.cookies.set(name, value, options);
  });
}

function redirectToLogin(request: NextRequest, response: NextResponse) {
  const redirect = NextResponse.redirect(new URL("/login", request.url));
  copyCookies(response, redirect);
  clearAuthCookies(request, redirect);
  return redirect;
}

function redirectToControl(request: NextRequest, response: NextResponse) {
  const redirect = NextResponse.redirect(new URL("/control", request.url));
  copyCookies(response, redirect);
  return redirect;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let response = NextResponse.next({ request });

  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    console.warn("[auth/proxy] Se descarto una sesion invalida", {
      code: userError.code,
      status: userError.status,
    });
    clearAuthCookies(request, response);

    if (pathname.startsWith("/control")) {
      return redirectToLogin(request, response);
    }

    return response;
  }

  if (pathname.startsWith("/control") && !userData.user) {
    return redirectToLogin(request, response);
  }

  if (pathname === "/login" && userData.user) {
    return redirectToControl(request, response);
  }

  return response;
}

export const config = { matcher: ["/login", "/control/:path*"] };
