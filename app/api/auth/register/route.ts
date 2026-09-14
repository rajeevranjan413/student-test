import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { email, password, fullName, secretPass, batchId, role = 'student' } = await request.json();

    // 1. Validate the global secret pass from your .env file
    if (secretPass !== process.env.REGISTRATION_SECRET_PASS) {
      return NextResponse.json({ error: 'Invalid secret password.' }, { status: 400 });
    }

    // 2. Initialize Supabase Admin
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 3. Create the user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, 
    });

    if (authError) throw authError;
    const userId = authData.user.id;

    // 4. Create the user profile in the database
    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
      id: userId,
      role,
      full_name: fullName,
    });

    if (profileError) throw profileError;

    // 5. Enroll the student in the selected batch
    if (batchId) {
      const { error: batchError } = await supabaseAdmin.from('student_batches').insert({
        student_id: userId,
        batch_id: batchId,
      });

      if (batchError) throw batchError;
    }

    return NextResponse.json({ message: 'Registration successful', user: authData.user });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}