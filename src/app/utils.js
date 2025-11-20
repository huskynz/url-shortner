// app/redirectUtils.js
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';

import { getRedisClient } from './lib/redis';
import supabase from './lib/supabase';

const REDIRECT_CACHE_TTL = Number(process.env.REDIS_REDIRECT_TTL || 300);
const REDIRECT_PRELOAD_ENABLED = process.env.REDIS_PRELOAD_ENABLED !== 'false';
const REDIRECT_PRELOAD_INTERVAL_MS = Number(process.env.REDIS_REDIRECT_PRELOAD_INTERVAL_MS || 300_000);
const RESERVED_ROUTES = new Set(['invaildlink', 'deprecated', 'urls', 'access-denied', 'password-protected']);

let preloadPromise = null;
let lastPreloadAt = 0;

function buildCacheKey(location) {
  return `redirect:${location}`;
}

async function readFromCache(redis, cacheKey) {
  try {
    const cached = await redis.get(cacheKey);
    return cached ? JSON.parse(cached) : null;
  } catch (cacheError) {
    console.error('Error reading from Redis:', cacheError);
    return null;
  }
}

async function cacheRedirect(redis, cacheKey, payload) {
  if (!redis || !payload) return;

  try {
    await redis.setex(cacheKey, REDIRECT_CACHE_TTL, JSON.stringify(payload));
  } catch (cacheError) {
    console.error('Error writing redirect to Redis:', cacheError);
  }
}

function shapeRedirectPayload(urlData, location) {
  if (!urlData) return null;

  if (urlData.deprecated) {
    return {
      redirect_url: '/deprecated',
      deprecated: true
    };
  }

  if (urlData.private) {
    return {
      redirect_url: '/password-protected',
      private: true,
      short_path: location || urlData.short_path,
      custom_message: urlData.custom_message || null
    };
  }

  return {
    redirect_url: urlData.redirect_url,
    deprecated: !!urlData.deprecated,
    private: !!urlData.private,
    short_path: urlData.short_path,
    custom_message: urlData.custom_message || null
  };
}

async function preloadRedirectCache(redis) {
  if (!redis || !REDIRECT_PRELOAD_ENABLED) return;

  const tableName = process.env.SUPABASE_DB_NAME;
  if (!tableName) {
    console.warn('Cannot preload redirects because SUPABASE_DB_NAME is not configured.');
    return;
  }

  const { data: urls, error } = await supabase
    .from(tableName)
    .select('short_path, redirect_url, deprecated, private, custom_message');

  if (error) {
    throw error;
  }

  if (!urls?.length) return;

  const pipeline = redis.pipeline();
  urls.forEach((url) => {
    if (RESERVED_ROUTES.has(url.short_path)) return;
    const cacheKey = buildCacheKey(url.short_path);
    const payload = shapeRedirectPayload(url);
    if (payload) {
      pipeline.setex(cacheKey, REDIRECT_CACHE_TTL, JSON.stringify(payload));
    }
  });

  await pipeline.exec();
}

function triggerPreload(redis) {
  if (!redis || !REDIRECT_PRELOAD_ENABLED) return null;
  const now = Date.now();

  if (preloadPromise) return preloadPromise;
  if (now - lastPreloadAt < REDIRECT_PRELOAD_INTERVAL_MS) return null;

  preloadPromise = preloadRedirectCache(redis)
    .catch((error) => {
      console.error('Error preloading redirect cache:', error);
    })
    .finally(() => {
      lastPreloadAt = Date.now();
      preloadPromise = null;
    });

  return preloadPromise;
}

export async function fetchRedirectUrl(location) {
  if (RESERVED_ROUTES.has(location)) {
    return null; // Special routes stay within the app
  }

  const redis = await getRedisClient();
  const cacheKey = buildCacheKey(location);

  if (redis) {
    triggerPreload(redis);
    const cached = await readFromCache(redis, cacheKey);
    if (cached) {
      return cached;
    }
  }

  const tableName = process.env.SUPABASE_DB_NAME;
  if (!tableName) {
    console.error('SUPABASE_DB_NAME is not configured; cannot look up redirects.');
    const fallback = {
      redirect_url: '/invaildlink',
      deprecated: false
    };
    await cacheRedirect(redis, cacheKey, fallback);
    return fallback;
  }

  const { data: urlData, error } = await supabase
    .from(tableName)
    .select('short_path, redirect_url, deprecated, private, custom_message')
    .eq('short_path', location)
    .single();

  const fallbackResponse = {
    redirect_url: '/invaildlink',
    deprecated: false
  };

  const isNotFoundError = error && (error.code === 'PGRST116' || error.message?.includes('No rows'));

  if (error && !isNotFoundError) {
    console.error(`Supabase error fetching redirect for '${location}':`, error);
    return fallbackResponse;
  }

  if (!urlData) {
    console.warn(`URL not found: ${location}`);
    await cacheRedirect(redis, cacheKey, fallbackResponse);
    return fallbackResponse;
  }

  const response = shapeRedirectPayload(urlData, location);
  await cacheRedirect(redis, cacheKey, response);

  return response;
}

export async function redirectToUrl(location) {
  const urlData = await fetchRedirectUrl(location);
  if (!urlData) {
    return; // Don't redirect special routes
  }
  redirect(urlData.redirect_url);
}

// Allow us to add and delete URLs from Supabase
export async function addUrl(shortPath, redirectUrl) {
  const { error } = await supabase
    .from(process.env.SUPABASE_DB_NAME)
    .insert({ short_path: shortPath, redirect_url: redirectUrl });
  if (error) console.error("Error adding URL:", error);
  return !error;
}

export async function deleteUrl(shortPath) {
  const { error } = await supabase
    .from(process.env.SUPABASE_DB_NAME)
    .delete()
    .eq("short_path", shortPath);
  if (error) console.error("Error deleting URL:", error);
  return !error;
}

// Funtion to allow /urls to fetch all URLs from Supabase
export async function fetchDisplayUrls() {
  const { data, error } = await supabase
    .from(process.env.SUPABASE_DB_NAME)
    .select("short_path, redirect_url, deprecated");
  if (error) {
    console.error("Error fetching URLs:", error);
    return [];
  }

  return data;
}

// Helper to parse browser from user agent
function getBrowser(userAgent) {
  if (!userAgent) return 'Unknown';
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('SamsungBrowser')) return 'Samsung Browser';
  if (userAgent.includes('Opera') || userAgent.includes('OPR')) return 'Opera';
  if (userAgent.includes('Edge')) return 'Edge';
  if (userAgent.includes('Chrome')) return 'Chrome';
  if (userAgent.includes('Safari')) return 'Safari';
  if (userAgent.includes('MSIE') || userAgent.includes('Trident')) return 'IE';
  return 'Unknown';
}

// Helper to parse OS from user agent
function getOS(userAgent) {
  if (!userAgent) return 'Unknown';
  if (userAgent.includes('Windows')) return 'Windows';
  if (userAgent.includes('Android')) return 'Android';
  if (userAgent.includes('iPhone') || userAgent.includes('iPad')) return 'iOS';
  if (userAgent.includes('Mac')) return 'macOS';
  if (userAgent.includes('Linux')) return 'Linux';
  return 'Unknown';
}

// Log user data in Supabase
export async function logUserData(location) {
  const header = await headers();
  const ip = header.get('x-forwarded-for') || 'Unknown IP';
  const userAgent = header.get("user-agent") || "Unknown";
  const environment = process.env.NEXT_PUBLIC_ENV || 'unknown';
  const versionNumber = process.env.NEXT_PUBLIC_Version_Number || 'unknown';

  const { data: userMapping, error: mappingError } = await supabase
    .from('user_ip_mapping')
    .upsert(
      {
        ip_address: ip,
        user_id: uuidv4(),
      },
      {
        onConflict: 'ip_address',
      }
    )
    .select('user_id')
    .single();

  if (mappingError || !userMapping) {
    console.error('Error upserting IP mapping:', mappingError);
    return;
  }

  const visitRecord = {
    short_path: location,
    ip_address: ip,
    user_agent: userAgent,
    environment,
    version_number: versionNumber,
    user_id: userMapping.user_id,
    browser: getBrowser(userAgent),
    os: getOS(userAgent),
    received_at: new Date().toISOString(),
  };

  const { error: enqueueError } = await supabase.from('visit_queue').insert([visitRecord]);

  if (enqueueError) {
    console.error('Error enqueueing visit for async processing:', enqueueError);
  } else {
    console.log('Visit enqueued for async processing');
  }
}
