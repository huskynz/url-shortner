import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    const { email, username, password } = await request.json();

    // Check if email is allowed
    const { data: allowedEmail } = await supabase
      .from('allowed_admins')
      .select('*')
      .eq('email', email)
      .is('password', null)
      .single();

    if (!allowedEmail) {
      return NextResponse.json({ error: 'Email not authorized' }, { status: 403 });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update the admin record with username and password
    const { error: updateError } = await supabase
      .from('allowed_admins')
      .update({ 
        username,
        password: hashedPassword
      })
      .eq('email', email);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
  }
} 