import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

/**
 * Student self-registration (F1 / DECISIONS.md D18).
 *
 * Gated by the SELECTED BATCH's per-batch `secret_pass` (the enrollment code the
 * teacher hands out), not a single global secret. `REGISTRATION_SECRET_PASS`, if
 * set, is an optional global master override accepted for any batch.
 *
 * Runs entirely on the service role: `student_batches` has no browser write policy
 * (RLS, D11) and `batches.secret_pass` must never reach the client.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email: string | undefined = body.email?.trim();
    const password: string | undefined = body.password;
    const fullName: string | undefined = body.fullName?.trim();
    const secretPass: string | undefined = body.secretPass;
    const batchId: string | undefined = body.batchId;
    // Role is server-decided: self-registration ALWAYS creates a student. Never
    // trust a client-supplied role (would be a privilege escalation to teacher).

    // 1. Validate input up front — before creating anything.
    if (!email || !password || !fullName || !batchId || !secretPass) {
      return NextResponse.json(
        { error: 'Email, full name, password, batch, and enrollment code are all required.' },
        { status: 400 }
      );
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters.' },
        { status: 400 }
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    // 2. Resolve the chosen batch and validate the enrollment code AGAINST IT.
    const { data: batch, error: batchError } = await supabaseAdmin
      .from('batches')
      .select('id, secret_pass, status')
      .eq('id', batchId)
      .maybeSingle();

    if (batchError) throw batchError;
    if (!batch || batch.status !== 'active') {
      return NextResponse.json(
        { error: 'That batch is not available. Please pick a valid batch.' },
        { status: 400 }
      );
    }

    const masterPass = process.env.REGISTRATION_SECRET_PASS;
    const codeMatches =
      secretPass === batch.secret_pass ||
      (!!masterPass && secretPass === masterPass);

    if (!codeMatches) {
      return NextResponse.json(
        { error: 'Invalid enrollment code for this batch.' },
        { status: 400 }
      );
    }

    // 3. Create the auth user (only now that the code is verified).
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (authError) {
      // Supabase reports an existing email here — surface it as a clean 409.
      const msg = authError.message?.toLowerCase() ?? '';
      if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
        return NextResponse.json(
          { error: 'An account with this email already exists. Please log in.' },
          { status: 409 }
        );
      }
      throw authError;
    }
    const userId = authData.user.id;

    // 4. Create the profile + enroll in the batch. If either fails, roll back the
    //    orphaned auth user so the student can retry with the same email.
    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
      id: userId,
      role: 'student',
      full_name: fullName,
    });
    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
      throw profileError;
    }

    const { error: enrollError } = await supabaseAdmin.from('student_batches').insert({
      student_id: userId,
      batch_id: batchId,
    });
    // 23505 = already enrolled; harmless and idempotent. Any other error rolls back.
    if (enrollError && enrollError.code !== '23505') {
      try {
        await supabaseAdmin.from('profiles').delete().eq('id', userId);
      } catch {}
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
      throw enrollError;
    }

    return NextResponse.json({
      message: 'Registration successful',
      user: { id: authData.user.id, email: authData.user.email },
    });
  } catch (error) {
    console.error('Registration Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Registration failed' },
      { status: 500 }
    );
  }
}
