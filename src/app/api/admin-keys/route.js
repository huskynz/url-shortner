// src/app/api/admin-keys/route.js
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAuth } from '@/app/lib/auth';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(req) {
    if (!await verifyAuth(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
        .from('api_keys')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json(data || []);
}

export async function POST(req) {
  if (!await verifyAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { name, expiration } = await req.json();
    const key = crypto.randomBytes(32).toString('hex');
    
    const { error } = await supabase
      .from('api_keys')
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