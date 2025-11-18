import { createClient } from '@supabase/supabase-js';

// Create a single instance of the Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false // Disable session persistence since we're using service role
    },
    global: {
      headers: {
        'x-application-name': 'url-shortener'
      }
    }
  }
);

// Cache for frequently accessed data
const cache = new Map();
// Keep TTL short to minimize stale admin/role data while still reducing chatter
const CACHE_TTL = 30 * 1000; // 30 second cache TTL

// Helper function to get cached data or fetch fresh data
export async function getCachedData(key, fetchFn, ttl = CACHE_TTL) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.data;
  }

  const data = await fetchFn();
  cache.set(key, {
    data,
    timestamp: Date.now()
  });
  return data;
}

// Helper function to invalidate cache
export function invalidateCache(key) {
  cache.delete(key);
}

export default supabase; 