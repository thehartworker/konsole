import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const OEFFENTLICHE_PFADE = ["/login"];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // auth.getUser() statt auth.getSession(): validiert das Token gegen den
  // Supabase-Auth-Server statt nur den Cookie-Inhalt ungeprueft zu lesen.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const istOeffentlich = OEFFENTLICHE_PFADE.some((pfad) => request.nextUrl.pathname.startsWith(pfad));

  if (!user && !istOeffentlich) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && request.nextUrl.pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
