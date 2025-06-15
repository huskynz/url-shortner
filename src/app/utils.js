// app/redirectUtils.js
import { createClient } from '@supabase/supabase-js';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

export async function fetchRedirectUrl(location) {
  // Special routes - don't redirect
  if (location === 'invaildlink' || location === 'deprecated' || location === 'urls' || location === 'access-denied' || location === 'password-protected') {
    return null;
  }

  // Get client IP
  const header = await headers();
  const ip = header.get('x-forwarded-for') || 'Unknown IP';

  // Fetch the URL from the database
  const { data: urlData, error } = await supabase
    .from(process.env.SUPABASE_DB_NAME)
    .select('*')
    .eq('short_path', location)
    .single();

  if (error || !urlData) {
    console.warn(`URL not found: ${location}`);
    return {
      redirect_url: "/invaildlink",
      deprecated: false,
    };
  }

  // Check if URL is deprecated
  if (urlData.deprecated) {
    console.warn(`Deprecated URL accessed: ${location}`);
    return {
      redirect_url: "/deprecated",
      deprecated: true,
    };
  }

  // Check if URL is password protected
  if (urlData.private) {
    console.warn(`Password protected URL accessed: ${location}`);
    return {
      redirect_url: "/password-protected",
      private: true,
      short_path: location,
      custom_message: urlData.custom_message || null
    };
  }

  return urlData;
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

  let userId;

  // Check if this IP already has a user_id assigned
  const { data: existingUsers, error: fetchError } = await supabase
    .from('user_ip_mapping')
    .select('user_id')
    .eq('ip_address', ip);

  if (fetchError) {
    console.error('Error fetching IP mapping:', fetchError);
    return;
  }

  if (existingUsers.length === 0) {
    // If no user exists for this IP, create a new UUID
    userId = uuidv4();

    // Insert the new mapping for this IP and user_id
    const { error: insertError } = await supabase
      .from('user_ip_mapping')
      .insert([
        {
          ip_address: ip,
          user_id: userId,
        }
      ]);

    if (insertError) {
      console.error('Error inserting IP mapping:', insertError);
      return;
    }
  } else {
    // Use the existing user_id from the IP mapping
    userId = existingUsers[0].user_id;
  }

  // Inserting log data into Supabase
  const { error } = await supabase.from('visits').insert([
    {
      short_path: location,
      ip_address: ip,
      user_agent: userAgent,
      environment: environment,
      version_number: versionNumber,
      user_id: userId,
      browser: getBrowser(userAgent),
      os: getOS(userAgent)
    }
  ]);

  if (error) {
    console.error('Error logging user data to Supabase:', error);
  } else {
    console.log('User data logged successfully!');
  }
}