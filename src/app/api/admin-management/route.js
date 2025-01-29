import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAuth } from '@/app/lib/auth';

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
      .from(process.env.ADMINS_DB)
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
    const { github_username, role = 'viewer' } = await request.json();
    
    // Check if admin already exists
    const { data: existing } = await supabase
      .from(process.env.ADMINS_DB)
      .select('github_username')
      .eq('github_username', github_username)
      .single();

    if (existing) {
      return NextResponse.json({ error: 'Admin already exists' }, { status: 400 });
    }

    const { error } = await supabase
      .from(process.env.ADMINS_DB)
      .insert([{ github_username, role }]);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to add admin' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { github_username } = await request.json();
    
    const { error } = await supabase
      .from(process.env.ADMINS_DB)
      .delete()
      .eq('github_username', github_username);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to remove admin' }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const { github_username, role } = await request.json();
    
    const { error } = await supabase
      .from(process.env.ADMINS_DB)
      .update({ role })
      .eq('github_username', github_username);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update admin role' }, { status: 500 });
  }
}