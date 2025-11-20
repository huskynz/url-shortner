import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { requireAdminSession } from '@/app/lib/auth';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const ADMIN_TABLE = process.env.ADMINS_DB || 'github_admins';

function buildAuthError(result) {
  return NextResponse.json(
    { error: result.error || 'Unauthorized' },
    { status: result.status || 401 }
  );
}

export async function GET(req) {
  const authResult = await requireAdminSession(req);
  if (!authResult.ok) {
    return buildAuthError(authResult);
  }

  try {
    const { data, error } = await supabase
      .from(ADMIN_TABLE)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch admins' }, { status: 500 });
  }
}

export async function POST(request) {
  const authResult = await requireAdminSession(request, { requireOwner: true });
  if (!authResult.ok) {
    return buildAuthError(authResult);
  }

  try {
    const { email, role } = await request.json();
    const normalizedEmail = email?.toLowerCase().trim();
    if (!normalizedEmail) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    const adminRole = role === 'owner' ? 'owner' : role === 'viewer' ? 'viewer' : 'admin';
    // Check if admin already exists by email
    const { data: existing } = await supabase
      .from(ADMIN_TABLE)
      .select('id')
      .eq('email', normalizedEmail)
      .single();

    if (existing) {
      return NextResponse.json({ error: 'Admin already exists' }, { status: 400 });
    }

    const { error } = await supabase
      .from(ADMIN_TABLE)
      .insert([{ email: normalizedEmail, role: adminRole }]);

    if (error) return NextResponse.json({ error: error.message || error }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to add admin' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const authResult = await requireAdminSession(request, { requireOwner: true });
  if (!authResult.ok) {
    return buildAuthError(authResult);
  }

  try {
    const { email } = await request.json();
    const normalizedEmail = email?.toLowerCase();
    if (!normalizedEmail) return NextResponse.json({ error: 'Email required' }, { status: 400 });

    const { error } = await supabase
      .from(ADMIN_TABLE)
      .delete()
      .eq('email', normalizedEmail);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to remove admin' }, { status: 500 });
  }
}

export async function PUT(request) {
  const authResult = await requireAdminSession(request, { requireOwner: true });
  if (!authResult.ok) {
    return buildAuthError(authResult);
  }

  try {
    const { email, role } = await request.json();
    const normalizedEmail = email?.toLowerCase();
    const adminRole = role === 'owner' ? 'owner' : role === 'admin' ? 'admin' : role === 'viewer' ? 'viewer' : null;
    if (!adminRole) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }
    
    // Update by email
    const { error } = await supabase
      .from(ADMIN_TABLE)
      .update({ role: adminRole })
      .eq('email', normalizedEmail);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update admin' }, { status: 500 });
  }
}

export async function PATCH(request) {
  const authResult = await requireAdminSession(request, { requireOwner: true });
  if (!authResult.ok) {
    return buildAuthError(authResult);
  }

  try {
    const { email, password } = await request.json();
    const normalizedEmail = email?.toLowerCase().trim();
    if (!normalizedEmail || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const updatePayload = { passset: true };
    if (Object.prototype.hasOwnProperty.call((await supabase.from(ADMIN_TABLE).select('password_hash').limit(1)).data?.[0] || {}, 'password_hash')) {
      updatePayload.password_hash = hashedPassword;
    } else {
      updatePayload.password = hashedPassword;
    }

    const { error } = await supabase
      .from(ADMIN_TABLE)
      .update(updatePayload)
      .eq('email', normalizedEmail);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to reset password:', error);
    return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 });
  }
}
