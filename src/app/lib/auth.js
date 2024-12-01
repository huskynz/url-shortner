import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { getToken } from 'next-auth/jwt';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function verifyKey(inputKey, storedHash, salt, iterations) {
  if (!inputKey || !storedHash || !salt || !iterations) {
    return false;
  }

  try {
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
  } catch (error) {
    console.error('Key verification error:', error);
    return false;
  }
}

export async function verifyAuth(req) {
  // First check for API key
  const apiKey = req.headers.get('x-api-key');
  if (apiKey) {
    try {
      // Get all active keys
      const { data: keys, error } = await supabase
        .from('api_keys')
        .select('*')
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString());

      if (error) {
        console.error('Error fetching API keys:', error);
        return false;
      }

      if (!keys || keys.length === 0) {
        return false;
      }

      // Find matching key
      const matchingKey = keys.find(k => verifyKey(apiKey, k.key, k.salt, k.iterations));
      
      if (matchingKey) {
        // Update usage metadata
        await supabase
          .from('api_keys')
          .update({ 
            use_count: matchingKey.use_count + 1,
            last_used: new Date().toISOString(),
            last_ip: req.headers.get('x-forwarded-for') || req.ip,
            metadata: {
              ...matchingKey.metadata,
              last_user_agent: req.headers.get('user-agent')
            }
          })
          .eq('id', matchingKey.id);

        return true;
      }
    } catch (error) {
      console.error('API key verification failed:', error);
    }
  }

  // Fall back to session auth for admin routes
  try {
    const token = await getToken({ req });
    if (!token?.username) {
      return false;
    }

    const { data: admin } = await supabase
      .from('github_admins')
      .select('role')
      .eq('github_username', token.username)
      .single();

    return !!admin;
  } catch (error) {
    console.error('Session auth failed:', error);
    return false;
  }
} 