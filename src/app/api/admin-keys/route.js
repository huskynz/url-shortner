// src/app/api/admin-keys/route.js
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdminSession } from '@/app/lib/auth';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(req) {
  const authResult = await requireAdminSession(req, { requireOwner: true });
  if (!authResult.ok) {
    return NextResponse.json(
      { error: authResult.error || 'Unauthorized' },
      { status: authResult.status || 401 }
    );
  }

  const { data, error } = await supabase
    .from(process.env.APIKEY_DB)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Failed to load API keys' }, { status: 500 });
  }
  return NextResponse.json(data || []);
}

export async function POST(req) {
  const authResult = await requireAdminSession(req, { requireOwner: true });
  if (!authResult.ok) {
    return NextResponse.json(
      { error: authResult.error || 'Unauthorized' },
      { status: authResult.status || 401 }
    );
  }

  try {
    const { name, expiration } = await req.json();
    const key = crypto.randomBytes(32).toString('hex');
    
    const { error } = await supabase
      .from(process.env.APIKEY_DB)
      .insert({
        key,
        name,
        expires_at: expiration ? new Date(Date.now() + parseDuration(expiration)).toISOString() : null,
      });

    if (error) throw error;
    return NextResponse.json({ key });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 });
  }
}

function parseDuration(duration) {
  const units = { d: 86400000, h: 3600000, m: 60000 };
  const match = duration.match(/^(\d+)([dhm])$/);
  if (!match) throw new Error('Invalid duration format');
  return match[1] * units[match[2]];
}
