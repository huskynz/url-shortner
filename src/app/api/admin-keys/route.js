import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getToken } from 'next-auth/jwt';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Generate a simple API key
function generateApiKey() {
  const uuid = crypto.randomUUID();
  const random = crypto.randomBytes(16).toString('hex');
  return `${uuid}-${random}`;
}

export async function GET(req) {
  try {
    const token = await getToken({ req });

    // Verify admin access for GET request
    const { data: admin } = await supabase
      .from('github_admins')
      .select('role')
      .eq('github_username', token?.username)
      .single();

    if (!token?.username || !admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetching all the API keys (or specific ones based on your needs)
    const { data: keys, error } = await supabase
      .from('api_keys_v2')
      .select('*');

    if (error) throw error;

    return NextResponse.json({ keys });
  } catch (error) {
    console.error('Error fetching API keys:', error);
    return NextResponse.json({ error: 'Failed to fetch API keys' }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const token = await getToken({ req });

    // Verify admin access
    const { data: admin } = await supabase
      .from('github_admins')
      .select('role')
      .eq('github_username', token?.username)
      .single();

    if (!token?.username || !admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, expiration } = await req.json();
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const key = generateApiKey();
    const expiresAt = expiration ? new Date(expiration).toISOString() : null;

    const { error } = await supabase
      .from('api_keys_v2')
      .insert([{ 
        key,
        name,
        created_by: token.username,
        expires_at: expiresAt,
        metadata: {
          created_from_ip: req.headers.get('x-forwarded-for') || req.ip,
          user_agent: req.headers.get('user-agent')
        }
      }]);

    if (error) throw error;

    return NextResponse.json({
      key,
      name,
      expires_at: expiresAt,
      message: expiresAt ? `API key expires on ${expiresAt}` : 'API key does not expire'
    });
  } catch (error) {
    console.error('Error creating API key:', error);
    return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 });
  }
}

