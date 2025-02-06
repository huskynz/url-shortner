import { auth } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyApiKey(req: Request) {
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey) return null;

  const { data, error } = await supabase
    .from('api_keys')
    .select('*')
    .eq('key', apiKey)
    .single();

  return { keyData: data, keyError: error };
}

export async function GET(req: Request) {
  // API Key auth
  const apiKeyResult = await verifyApiKey(req);
  if (apiKeyResult) {
    const { keyData, keyError } = apiKeyResult;
    if (keyError || !keyData) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Expired API key' }, { status: 401 });
    }
  } else {
    // Clerk auth
    const { userId } = auth();
    if (!userId) {
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

export async function POST(request: Request) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { github_username, role = 'viewer' } = await request.json();
    
    const { data: existing } = await supabase
      .from(process.env.ADMINS_DB)
      .select('github_username')
      .eq('github_username', github_username)
      .single();

    if (existing) {
      return NextResponse.json({ error: 'Admin already exists' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from(process.env.ADMINS_DB)
      .insert([{ github_username, role }]);

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to add admin' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { github_username, role } = await request.json();
    
    const { data, error } = await supabase
      .from(process.env.ADMINS_DB)
      .update({ role })
      .eq('github_username', github_username);

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update admin' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const github_username = searchParams.get('github_username');

  try {
    const { error } = await supabase
      .from(process.env.ADMINS_DB)
      .delete()
      .eq('github_username', github_username);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete admin' }, { status: 500 });
  }
}