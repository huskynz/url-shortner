import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdminSession } from '@/app/lib/auth';
import { v4 as uuidv4 } from 'uuid';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    const authResult = await requireAdminSession(request, { requireOwner: true });
    if (!authResult.ok) {
      return NextResponse.json(
        { error: authResult.error || 'Unauthorized' },
        { status: authResult.status || 401 }
      );
    }
    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    const resetToken = uuidv4();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error: insertError } = await supabase
      .from('password_reset_tokens')
      .insert([{ email, token: resetToken, expires_at: expiresAt, used: false }]);
    if (insertError) return NextResponse.json({ error: insertError.message || insertError }, { status: 500 });
    return NextResponse.json({ token: resetToken });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to create password set token' }, { status: 500 });
  }
} 
