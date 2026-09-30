import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getRegistrationSecret } from '@/utils/settings';

/**
 * Student self-registration (F1 / DECISIONS.md D18, D23, D35).
 *
 * The enrollment code the student enters depends on how many batches they pick:
 *   - EXACTLY ONE batch  → the code must match THAT batch's per-batch `secret_pass`.
 *   - MULTIPLE batches   → the code must match the center-wide multi-batch code: the
 *                          admin-editable `registration_secret_pass` setting when set,
 *                          else the `REGISTRATION_SECRET_PASS` env fallback
 *                          (`getRegistrationSecret`, D37). If neither is set,
 *                          multi-batch self-registration is disabled.
 * On success the student is enrolled in ALL selected batches. This supersedes the
 * D23 rule (one batch's code unlocked the others) — see D35.
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
    // Accept the new `batchIds` array; fall back to the legacy single `batchId`
    // so older clients keep working (additive, non-breaking — D23).
    const rawIds: unknown = Array.isArray(body.batchIds)
      ? body.batchIds
      : body.batchId != null
        ? [body.batchId]
        : [];
    const batchIds = Array.from(
      new Set(
        (rawIds as unknown[]).filter(
          (v): v is string => typeof v === 'string' && v.length > 0
        )
      )
    );
    // Role is server-decided: self-registration ALWAYS creates a student. Never
    // trust a client-supplied role (would be a privilege escalation to teacher).

    // 1. Validate input up front — before creating anything.
    if (!email || !password || !fullName || batchIds.length === 0 || !secretPass) {
      return NextResponse.json(
        { error: 'Email, full name, password, at least one batch, and enrollment code are all required.' },
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

    // 2. Resolve every chosen batch; they must all exist and be active.
    const { data: batches, error: batchError } = await supabaseAdmin
      .from('batches')
      .select('id, secret_pass, status')
      .in('id', batchIds);

    if (batchError) throw batchError;

    const activeBatches = (batches ?? []).filter((b) => b.status === 'active');
    if (activeBatches.length !== batchIds.length) {
      return NextResponse.json(
        { error: 'One or more selected batches are not available. Please pick valid batches.' },
        { status: 400 }
      );
    }

    // 3. Validate the enrollment code. One batch → that batch's own code; multiple
    //    batches → the global REGISTRATION_SECRET_PASS. See D35.
    if (activeBatches.length === 1) {
      if (secretPass !== activeBatches[0].secret_pass) {
        return NextResponse.json(
          { error: 'Invalid enrollment code for the selected batch.' },
          { status: 400 }
        );
      }
    } else {
      // The center-wide multi-batch code: the admin-editable app setting when set,
      // else the REGISTRATION_SECRET_PASS env fallback (see utils/settings.ts, D37).
      const { value: globalPass } = await getRegistrationSecret(supabaseAdmin);
      if (!globalPass) {
        return NextResponse.json(
          { error: 'Multi-batch registration is not available. Please register for one batch at a time.' },
          { status: 400 }
        );
      }
      if (secretPass !== globalPass) {
        return NextResponse.json(
          { error: 'Invalid registration code for multiple batches.' },
          { status: 400 }
        );
      }
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

    const { error: enrollError } = await supabaseAdmin.from('student_batches').insert(
      batchIds.map((batch_id) => ({ student_id: userId, batch_id }))
    );
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
