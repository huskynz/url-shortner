import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { getToken } from 'next-auth/jwt';
import { verifyAuth } from '@/app/lib/auth';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Prefix for identifying our API keys
const API_KEY_PREFIX = 'hsk';
const KEY_VERSION = '1';

function generateApiKey() {
  // Generate multiple random components
  const timestamp = Date.now().toString(36);
  const uuid = crypto.randomUUID();
  const random = crypto.randomBytes(32).toString('hex');
  
  // Create a complex key structure
  const keyComponents = [
    API_KEY_PREFIX,              // Key type identifier
    KEY_VERSION,                 // Version for future key rotation
    timestamp,                   // Timestamp component
    uuid,                       // UUID component
    random                      // Random component
  ];
  
  // Join with different separators to make it harder to predict structure
  const rawKey = keyComponents.join('_');
  
  // Double hash the key for extra security
  const hashedOnce = crypto.createHash('sha256').update(rawKey).digest('hex');
  const finalKey = crypto.createHash('sha512')
    .update(hashedOnce + process.env.SUPABASE_SERVICE_ROLE_KEY) // Add server secret
    .digest('base64')
    .replace(/[/+=]/g, '') // Make URL safe
    .substring(0, 64); // Keep reasonable length
    
  return `${API_KEY_PREFIX}_${KEY_VERSION}_${finalKey}`;
}

function hashKeyForStorage(key) {
  // Use a more complex hashing scheme for storage
  const salt = crypto.randomBytes(16).toString('hex');
  const iterations = 100000; // High iteration count for PBKDF2
  const keyLength = 64;
  
  const hash = crypto.pbkdf2Sync(
    key,
    salt,
    iterations,
    keyLength,
    'sha512'
  ).toString('hex');
  
  return {
    hash: hash,
    salt: salt,
    iterations: iterations
  };
}

function verifyKey(inputKey, storedHash, salt, iterations) {
  const inputHash = crypto.pbkdf2Sync(
    inputKey,
    salt,
    iterations,
    64,
    'sha512'
  ).toString('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(inputHash),
    Buffer.from(storedHash)
  );
}

function parseExpiration(expiration) {
  if (!expiration) return null;

  // If it's a date string, parse it directly
  if (expiration.includes('-')) {
    const date = new Date(expiration);
    return isNaN(date.getTime()) ? null : date;
  }

  // Parse duration format (e.g., "1h", "7d", "30d")
  const match = expiration.match(/^(\d+)([hdwmy])$/);
  if (!match) return null;

  const [, amount, unit] = match;
  const now = new Date();

  switch (unit.toLowerCase()) {
    case 'h': // hours
      return new Date(now.getTime() + parseInt(amount) * 60 * 60 * 1000);
    case 'd': // days
      return new Date(now.getTime() + parseInt(amount) * 24 * 60 * 60 * 1000);
    case 'w': // weeks
      return new Date(now.getTime() + parseInt(amount) * 7 * 24 * 60 * 60 * 1000);
    case 'm': // months
      return new Date(now.setMonth(now.getMonth() + parseInt(amount)));
    case 'y': // years
      return new Date(now.setFullYear(now.getFullYear() + parseInt(amount)));
    default:
      return null;
  }
}

export async function POST(req) {
  try {
    // Check auth token
    const token = await getToken({ req });
    
    // Check if user is admin
    const { data: admin } = await supabase
      .from('github_admins')
      .select('role')
      .eq('github_username', token?.username)
      .single();

    if (!token?.username || !admin) {
      console.warn('Unauthorized attempt to create API key:', token?.username);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, expiration } = await req.json();
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Generate new API key
    const key = generateApiKey();
    const { hash, salt, iterations } = hashKeyForStorage(key);

    // Parse expiration
    let expiresAt = null;
    if (expiration) {
      expiresAt = parseExpiration(expiration);
      if (!expiresAt) {
        return NextResponse.json({ 
          error: 'Invalid expiration format. Use ISO date or duration (e.g., "1h", "7d", "30d")' 
        }, { status: 400 });
      }
    }

    // Create the key
    const { error } = await supabase
      .from('api_keys')
      .insert([{ 
        key: hash,
        salt,
        iterations,
        name,
        created_by: token.username,
        created_at: new Date().toISOString(),
        expires_at: expiresAt?.toISOString() || null,
        is_active: true,
        use_count: 0,
        metadata: {
          created_from_ip: req.headers.get('x-forwarded-for') || req.ip,
          user_agent: req.headers.get('user-agent')
        }
      }]);

    if (error) throw error;
    
    return NextResponse.json({ 
      key,
      name,
      expires_at: expiresAt?.toISOString() || null,
      message: expiresAt 
        ? `API key will expire on ${expiresAt.toLocaleString()}` 
        : 'API key will not expire'
    });
  } catch (error) {
    console.error('Error creating API key:', error);
    return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 });
  }
}

export async function GET(req) {
  try {
    // Check auth token
    const token = await getToken({ req });
    
    // Check if user is admin
    const { data: admin } = await supabase
      .from('github_admins')
      .select('role')
      .eq('github_username', token?.username)
      .single();

    if (!token?.username || !admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('api_keys')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Error fetching API keys:', error);
    return NextResponse.json({ error: 'Failed to fetch API keys' }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const isAuthorized = await verifyAuth(req);
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'Key ID is required' }, { status: 400 });
    }

    // Actually delete the key
    const { error } = await supabase
      .from('api_keys')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ message: 'API key deleted successfully' });
  } catch (error) {
    console.error('Error deleting API key:', error);
    return NextResponse.json({ error: 'Failed to delete API key' }, { status: 500 });
  }
}

export async function PUT(req) {
  try {
    const token = await getToken({ req });
    if (!token?.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, name, expiration } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'Key ID is required' }, { status: 400 });
    }

    // Parse expiration if provided
    const expiresAt = expiration ? parseExpiration(expiration) : null;
    if (expiration && !expiresAt) {
      return NextResponse.json({ 
        error: 'Invalid expiration format. Use ISO date or duration (e.g., "1h", "7d", "30d", "1m", "1y")' 
      }, { status: 400 });
    }

    const updateData = {
      updated_by: token.username,
      updated_at: new Date().toISOString(),
      metadata: {
        last_modified_from_ip: req.headers.get('x-forwarded-for') || req.ip,
        last_modified_user_agent: req.headers.get('user-agent')
      }
    };

    if (name) updateData.name = name;
    if (expiresAt) updateData.expires_at = expiresAt.toISOString();

    const { error } = await supabase
      .from('api_keys')
      .update(updateData)
      .eq('id', id);

    if (error) throw error;
    
    return NextResponse.json({ 
      message: 'API key updated successfully',
      expires_at: expiresAt?.toISOString() || null
    });
  } catch (error) {
    console.error('Error updating API key:', error);
    return NextResponse.json({ error: 'Failed to update API key' }, { status: 500 });
  }
}

export async function PATCH(req) {
  try {
    const token = await getToken({ req });
    
    const { data: admin } = await supabase
      .from('github_admins')
      .select('role')
      .eq('github_username', token?.username)
      .single();

    if (!token?.username || !admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'Key ID is required' }, { status: 400 });
    }

    // First get current status
    const { data: currentKey } = await supabase
      .from('api_keys')
      .select('is_active')
      .eq('id', id)
      .single();

    // Toggle the status
    const { error } = await supabase
      .from('api_keys')
      .update({ 
        is_active: !currentKey.is_active,
        updated_at: new Date().toISOString(),
        updated_by: token.username
      })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ 
      message: `API key ${currentKey.is_active ? 'deactivated' : 'activated'} successfully` 
    });
  } catch (error) {
    console.error('Error toggling API key status:', error);
    return NextResponse.json({ error: 'Failed to update API key status' }, { status: 500 });
  }
} 