import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAuth } from '@/app/lib/auth';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(req) {
  // Check for API key in Authorization header
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const apiKey = authHeader.substring(7);
    
    // Validate API key
    const { data: keyData, error: keyError } = await supabase
      .from(process.env.APIKEY_DB)
      .select('*')
      .eq('key', apiKey)
      .eq('is_active', true)
      .single();

    if (keyError || !keyData) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    // Check if key is expired
    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Expired API key' }, { status: 401 });
    }
  } else {
    // Fall back to session auth if no API key
    if (!await verifyAuth(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const { data, error } = await supabase
      .from('github_admins')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch admins' }, { status: 500 });
  }
}

export async function POST(request) {
  if (!await verifyAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { email, github_id, github_username, role } = await request.json();
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    const adminRole = role === 'owner' ? 'owner' : 'admin'; // Only allow 'admin' or 'owner'
    // Check if admin already exists by email or github_id
    const { data: existing } = await supabase
      .from('github_admins')
      .select('id')
      .or(`email.eq.${email},github_id.eq.${github_id}`)
      .single();

    if (existing) {
      return NextResponse.json({ error: 'Admin already exists' }, { status: 400 });
    }

    const { error } = await supabase
      .from('github_admins')
      .insert([{ email, github_id, github_username, role: adminRole }]);

    if (error) return NextResponse.json({ error: error.message || error }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to add admin' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { email, github_id } = await request.json();
    
    // Delete by email or github_id
    const { error } = await supabase
      .from('github_admins')
      .delete()
      .or(`email.eq.${email},github_id.eq.${github_id}`);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to remove admin' }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const { email, github_id, role } = await request.json();
    
    // Update by email or github_id
    const { error } = await supabase
      .from('github_admins')
      .update({ role })
      .or(`email.eq.${email},github_id.eq.${github_id}`);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update admin' }, { status: 500 });
  }
}

// New endpoint for admin password reset
export async function POST_reset_password(request) {
  try {
    // Authenticate the requester
    if (!await verifyAuth(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Get the requester session (to check role)
    const token = await getToken({ req: request });
    if (!token || (token.role !== 'owner' && token.role !== 'admin')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }
    // Hash the new password
    const hashedPassword = await bcrypt.hash(password, 10);
    // Update the user's password
    const { error: updateError } = await supabase
      .from('github_admins')
      .update({ password: hashedPassword, passset: true })
      .eq('email', email);
    if (updateError) throw updateError;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 });
  }
}

// New endpoint to create a password set token
export async function POST_create_password_token(request) {
  try {
    if (!await verifyAuth(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = await getToken({ req: request });
    if (!token || (token.role !== 'owner' && token.role !== 'admin')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    // Generate a UUID token
    const resetToken = uuidv4();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours from now
    // Insert into password_reset_tokens
    const { error: insertError } = await supabase
      .from('password_reset_tokens')
      .insert([{ email, token: resetToken, expires_at: expiresAt, used: false }]);
    if (insertError) return NextResponse.json({ error: insertError.message || insertError }, { status: 500 });
    return NextResponse.json({ token: resetToken });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to create password set token' }, { status: 500 });
  }
}