import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const ADMIN_TABLE = process.env.ADMINS_DB || 'github_admins';

export async function POST(request) {
  try {
    const body = await request.json();
    console.log('SET PASSWORD BODY:', body);
    const { email, password, id, github_username, github_id } = body;
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }
    let matchColumn = null;
    let matchValue = null;
    // Only use id if it looks like a UUID
    if (id && /^[0-9a-fA-F-]{36}$/.test(id)) {
      matchColumn = 'id';
      matchValue = id;
    } else if (github_username) {
      matchColumn = 'github_username';
      matchValue = github_username;
    } else if (github_id) {
      matchColumn = 'github_id';
      matchValue = github_id;
    } else {
      console.log('NO USER IDENTIFIER FOUND:', { id, github_username, github_id });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log('MATCHING ON:', matchColumn, matchValue);
    const normalizedEmail = email.toLowerCase().trim();

    const { data: admin, error: fetchError } = await supabase
      .from(ADMIN_TABLE)
      .select('*')
      .eq(matchColumn, matchValue)
      .single();

    if (fetchError || !admin) {
      console.error('Set password admin lookup failed:', fetchError);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);
    // Set passset to true
    const updatePayload = { email: normalizedEmail, passset: true };
    if (Object.prototype.hasOwnProperty.call(admin, 'password_hash')) {
      updatePayload.password_hash = hashedPassword;
    }
    if (Object.prototype.hasOwnProperty.call(admin, 'password')) {
      updatePayload.password = hashedPassword;
    }

    const { error: updateError } = await supabase
      .from(ADMIN_TABLE)
      .update(updatePayload)
      .eq('id', admin.id);
    if (updateError) throw updateError;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Set password error:', error);
    return NextResponse.json({ error: 'Failed to set email and password' }, { status: 500 });
  }
} 
