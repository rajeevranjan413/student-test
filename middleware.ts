import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => 
            request.cookies.set(name, value)
          );
          
          supabaseResponse = NextResponse.next({
            request,
          });
          
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Securely get the authenticated user
  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  // Define route types
  const isAdminRoute = path.startsWith('/admin');
  const isStudentRoute = path.startsWith('/student');
  const isAuthRoute = path.startsWith('/login') || path.startsWith('/signup');
  // The `/` landing page is a role chooser meant for signed-out visitors.
  const isRootRoute = path === '/';

  // 1. Redirect completely unauthenticated users to login
  if (!user && (isAdminRoute || isStudentRoute)) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 2. Handle Role-Based Access for Authenticated Users
  if (user) {
    // We only query the database for the user's role if they are hitting an admin route,
    // login/signup, or the `/` landing page. This saves database reads when students are
    // just browsing student routes.
    if (isAdminRoute || isAuthRoute || isRootRoute) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      const userRole = profile?.role || 'student'; // fallback to student

      // Prevent students from accessing admin pages
      if (isAdminRoute && userRole !== 'teacher') {
        return NextResponse.redirect(new URL('/student', request.url));
      }

      // If they already have a session, skip the sign-in/role-chooser screens
      // (`/login`, `/signup`, and the `/` landing page) and send them to their home page.
      if (isAuthRoute || isRootRoute) {
        if (userRole === 'teacher') {
          return NextResponse.redirect(new URL('/admin', request.url));
        } else {
          return NextResponse.redirect(new URL('/student', request.url));
        }
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api routes
     */
    '/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};