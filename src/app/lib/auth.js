import { createClient } from '@supabase/supabase-js';
import { getToken } from 'next-auth/jwt';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function verifyAuth(req) {
  // First check for API key in the request headers
  const apiKey = req.headers.get('x-api-key');
  if (apiKey) {
    try {
      // Fetch all active API keys with valid expiration
      const { data: keys, error } = await supabase
        .from('api_keys')
        .select('*')
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString()); // Check for keys that are still valid

      if (error) {
        console.error('Error fetching API keys:', error);
        return false;
      }

      if (!keys || keys.length === 0) {
        return false;
      }

      // Look for a matching key
      const matchingKey = keys.find(k => k.key === apiKey); // Check if the API key matches

      if (matchingKey) {
        // If a match is found, update the usage metadata
        await supabase
          .from('api_keys')
          .update({
            use_count: matchingKey.use_count + 1,
            last_used: new Date().toISOString(),
            last_ip: req.headers.get('x-forwarded-for') || req.ip,
            metadata: {
              ...matchingKey.metadata,
              last_user_agent: req.headers.get('user-agent'),
            },
          })
          .eq('id', matchingKey.id);

        return true;
      } else {
        console.warn('Invalid API key used');
        return false;
      }
    } catch (error) {
      console.error('API key verification failed:', error);
      return false;
    }
  }

  // Fall back to session auth for admin routes if no API key is provided
  try {
    const token = await getToken({ req });
    if (!token?.username) {
      return false;
    }

    // Check if the user is an admin
    const { data: admin } = await supabase
      .from('github_admins')
      .select('role')
      .eq('github_username', token.username)
      .single();

    // Return true if the user has an admin role
    return !!admin;
  } catch (error) {
    console.error('Session auth failed:', error);
    return false;
  }
}
