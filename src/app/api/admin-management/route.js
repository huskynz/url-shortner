import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAuth } from '@/app/lib/auth';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(req) {
  if (!await verifyAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
    const { github_username, role = 'viewer' } = await request.json();
    
    // Check if admin already exists
    const { data: existing } = await supabase
      .from('github_admins')
      .select('github_username')
      .eq('github_username', github_username)
      .single();

    if (existing) {
      return NextResponse.json({ error: 'Admin already exists' }, { status: 400 });
    }

    const { error } = await supabase
      .from('github_admins')
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
      .from('github_admins')
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
      .from('github_admins')
      .update({ role })
      .eq('github_username', github_username);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update admin role' }, { status: 500 });
  }
} 