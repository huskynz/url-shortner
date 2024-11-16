import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET() {
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
  try {
    const { github_username } = await request.json();
    
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
      .insert([{ github_username }]);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to add admin' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const github_username = searchParams.get('github_username');

    if (!github_username) {
      return NextResponse.json({ error: 'No username provided' }, { status: 400 });
    }

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