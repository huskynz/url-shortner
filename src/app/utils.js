// app/redirectUtils.js
import { createClient } from '@supabase/supabase-js';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';


const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);


export async function fetchRedirectUrl(location) {
  // Special routes - don't redirect
  if (location === 'invaildlink' || location === 'deprecated' || location === 'urls') {
    return null;
  }

  const { data, error } = await supabase
    .from(process.env.SUPABASE_DB_NAME)
    .select("redirect_url, deprecated, short_path")
    .eq("short_path", location)
    .single();

  if (error || !data) {
    return {
      redirect_url: "/invaildlink",
      deprecated: false
    };
  }

  if (data.deprecated) {
    return {
      redirect_url: `/deprecated?dpl=${location}`,
      deprecated: true
    };
  }

  return {
    redirect_url: data.redirect_url,
    deprecated: false
  };
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


// Discord webhook URL (replace with your actual webhook URL)
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// Log user data in Supabase
export async function logUserData(location) {
  const headers = (typeof window !== "undefined" && window?.headers) || {}; // You may replace this with how you fetch headers in your app

  const ip = headers['x-forwarded-for'] || 'Unknown IP'; // Fallback if IP is not found
  const userAgent = headers['user-agent'] || 'Unknown';
  const environment = process.env.NEXT_PUBLIC_ENV || 'unknown';
  const versionNumber = process.env.NEXT_PUBLIC_Version_Number || 'unknown';

  // Inserting log data into Supabase
  const { error } = await supabase.from('user_logs').insert([
    {
      short_path: location,
      ip_address: ip,
      user_agent: userAgent,
      environment: environment,
      version_number: versionNumber,
    }
  ]);

  if (error) {
    console.error('Error logging user data to Supabase:', error);
  } else {
    console.log('User data logged successfully!');
  }
}
