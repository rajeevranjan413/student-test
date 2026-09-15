import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    const cookieStore = await cookies();

    // 1. FIXED: Using PUBLISHABLE_KEY and getAll/setAll cookie syntax
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, 
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Ignore if called from a Server Component
            }
          },
        },
      }
    );

    // --- 1. TEACHER LOGIN INTERCEPTION ---
    if (email === process.env.TEACHER_EMAIL) {
      if (password !== process.env.TEACHER_PASSWORD) {
        return NextResponse.json({ error: 'Invalid teacher credentials' }, { status: 401 });
      }

      // Try to sign in normally first
      let { data, error } = await supabase.auth.signInWithPassword({ email, password });

      // If the teacher doesn't exist in Supabase yet, create them automatically
      if (error && error.message.includes('Invalid login credentials')) {
        const supabaseAdmin = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Create user in auth.users
        const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });

        if (createError) throw createError;

        // Insert into the profiles table
        await supabaseAdmin.from('profiles').insert({
          id: authData.user.id,
          role: 'teacher',
          full_name: 'Admin Teacher',
        });

        // Now establish the session cookie by signing in
        const retryLogin = await supabase.auth.signInWithPassword({ email, password });
        data = retryLogin.data;
        error = retryLogin.error;
      }

      if (error) throw error;
      return NextResponse.json({
        user: data?.user,
        role: 'teacher',
        message: 'Teacher logged in successfully',
      });
    }

    // --- 2. STANDARD STUDENT LOGIN ---
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    // Return the user's ACTUAL role so the client redirects to the right dashboard
    // regardless of the login-page role toggle.
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single();

    return NextResponse.json({ user: data.user, role: profile?.role ?? 'student' });
  } catch (error) {
    console.error("Login Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Login failed" },
      { status: 500 }
    );
  }
}