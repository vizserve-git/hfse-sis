import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

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
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Use getClaims() instead of getUser() to avoid a network round-trip to
  // Supabase Auth on every navigation. getClaims() verifies the JWT
  // signature locally against the cached JWKS (requires the project to use
  // asymmetric signing keys; falls back to getUser() internally on legacy
  // HS256 projects).
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;
  return { response, claims };
}
