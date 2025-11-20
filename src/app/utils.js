// app/redirectUtils.js
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';

import { getRedisClient } from './lib/redis';
import supabase from './lib/supabase';

export async function fetchRedirectUrl(location) {
  // Special routes - don't redirect
  if (location === 'invaildlink' || location === 'deprecated' || location === 'urls' || location === 'access-denied' || location === 'password-protected') {
    return null;
  }

  const redis = await getRedisClient();
  const cacheKey = `redirect:${location}`;

  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (cacheError) {
      console.error('Error reading from Redis:', cacheError);
    }
  }

  // Fetch the URL from the database
  const { data: urlData, error } = await supabase
    .from(process.env.SUPABASE_DB_NAME)
    .select('*')
    .eq('short_path', location)
    .single();

  if (error || !urlData) {
    console.warn(`URL not found: ${location}`);
    const fallback = {
      redirect_url: "/invaildlink",
      deprecated: false,
    };
    if (redis) {
      redis.setex(cacheKey, 300, JSON.stringify(fallback)).catch((cacheError) => {
        console.error('Error writing invalid redirect to Redis:', cacheError);
      });
    }
    return fallback;
  }

  // Check if URL is deprecated
  if (urlData.deprecated) {
    console.warn(`Deprecated URL accessed: ${location}`);
    const deprecatedResponse = {
      redirect_url: "/deprecated",
      deprecated: true,
    };
    if (redis) {
      redis.setex(cacheKey, 300, JSON.stringify(deprecatedResponse)).catch((cacheError) => {
        console.error('Error writing deprecated redirect to Redis:', cacheError);
      });
    }
    return deprecatedResponse;
  }

  // Check if URL is password protected
  if (urlData.private) {
    console.warn(`Password protected URL accessed: ${location}`);
    const privateResponse = {
      redirect_url: "/password-protected",
      private: true,
      short_path: location,
      custom_message: urlData.custom_message || null
    };
    if (redis) {
      redis.setex(cacheKey, 300, JSON.stringify(privateResponse)).catch((cacheError) => {
        console.error('Error writing private redirect to Redis:', cacheError);
      });
    }
    return privateResponse;
  }

  const response = {
    redirect_url: urlData.redirect_url,
    deprecated: urlData.deprecated,
    private: urlData.private,
    short_path: urlData.short_path,
    custom_message: urlData.custom_message || null,
  };

  if (redis) {
    redis.setex(cacheKey, 300, JSON.stringify(response)).catch((cacheError) => {
      console.error('Error writing redirect to Redis:', cacheError);
    });
  }

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