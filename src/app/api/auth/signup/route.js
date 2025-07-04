import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { getToken } from 'next-auth/jwt';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    const { email, password, github_id, github_username } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }
    // Check if email already exists
    const { data: existing } = await supabase
      .from('admins')
      .select('id')
      .eq('email', email)
      .single();
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 400 });
    }
    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);
    // Create new admin
    const { error: insertError } = await supabase
      .from('admins')
      .insert([{
        email,
        password_hash: hashedPassword,
        github_id: github_id || null,
        github_username: github_username || null,
        role: 'viewer', // default role
      }]);
    if (insertError) throw insertError;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
  }
}

export async function SET_PASSWORD(request) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }
    // Get the current user from the session token
    const token = await getToken({ req: request });
    if (!token?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);
    // Update the user's email and password_hash in github_admins
    const { error: updateError } = await supabase
      .from('github_admins')
      .update({ email, password_hash: hashedPassword })
      .eq('id', token.id);
    if (updateError) throw updateError;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Set password error:', error);
    return NextResponse.json({ error: 'Failed to set email and password' }, { status: 500 });
  }
} 