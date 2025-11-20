import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { getToken } from 'next-auth/jwt';
import { requireAdminSession } from '@/app/lib/auth';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const ADMIN_TABLE = process.env.ADMINS_DB || 'github_admins';

export async function POST(request) {
  try {
    const authResult = await requireAdminSession(request, { requireOwner: true });
    if (!authResult.ok) {
      return NextResponse.json(
        { error: authResult.error || 'Unauthorized' },
        { status: authResult.status || 401 }
      );
    }

    const { email, password, role } = await request.json();
    const normalizedEmail = email?.toLowerCase().trim();
    if (!normalizedEmail || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }
    const pickedRole = role === 'owner' ? 'owner' : role === 'admin' ? 'admin' : 'viewer';
    // Check if email already exists
    const { data: existing } = await supabase
      .from(ADMIN_TABLE)
      .select('id')
      .eq('email', normalizedEmail)
      .single();
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 400 });
    }
    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    const basePayload = {
      email: normalizedEmail,
      role: pickedRole,
    };

    // Create new admin
    let { error: insertError } = await supabase
      .from(ADMIN_TABLE)
      .insert([{ ...basePayload, password_hash: hashedPassword }]);

    if (insertError && insertError.message?.toLowerCase().includes('password_hash')) {
      // Fallback for legacy schemas that still use `password`
      const { error: legacyError } = await supabase
        .from(ADMIN_TABLE)
        .insert([{ ...basePayload, password: hashedPassword }]);
      insertError = legacyError;
    }

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
    const normalizedEmail = email.toLowerCase().trim();
    let { error: updateError } = await supabase
      .from(ADMIN_TABLE)
      .update({ email: normalizedEmail, password_hash: hashedPassword })
      .eq('id', token.id);

    if (updateError && updateError.message?.toLowerCase().includes('password_hash')) {
      const { error: legacyUpdateError } = await supabase
        .from(ADMIN_TABLE)
        .update({ email: normalizedEmail, password: hashedPassword })
        .eq('id', token.id);
      updateError = legacyUpdateError;
    }

    if (updateError) throw updateError;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Set password error:', error);
    return NextResponse.json({ error: 'Failed to set email and password' }, { status: 500 });
  }
} 
