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
    .from("shortened_urls")
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
    .from("shortened_urls")
    .insert({ short_path: shortPath, redirect_url: redirectUrl });
  if (error) console.error("Error adding URL:", error);
  return !error;
}

export async function deleteUrl(shortPath) {
  const { error } = await supabase
    .from("shortened_urls")
    .delete()
    .eq("short_path", shortPath);
  if (error) console.error("Error deleting URL:", error);
  return !error;
}

// Funtion to allow /urls to fetch all URLs from Supabase
export async function fetchDisplayUrls() {
  const { data, error } = await supabase
    .from("shortened_urls")
    .select("short_path, redirect_url, deprecated");
  if (error) {
    console.error("Error fetching URLs:", error);
    return [];
  }

  return data;
}


// Discord webhook URL (replace with your actual webhook URL)
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// Function to send a message to Discord webhook
export async function logUserData(location) {
    const header = headers()

    const ip = header.get('x-forwarded-for') || 'Unknown IP'; // Fallback if IP is not found
    const userAgent = header.get("user-agent") || "Unknown";

    const payload = {
        content: `
        🚨 New visitor detected!
        **IP Address**: ${ip}
        **User-Agent**: ${userAgent}
        **Redirect**: ${location}
        **Ip Info**: https://whatismyipaddress.com/ip/${ip}
        \n
        `,
      };
    try {
        const response = await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            console.error('Failed to send message to Discord:', response.statusText);
        } else {
            console.log('Message sent to Discord successfully!');
        }
    } catch (error) {
        console.error('Error sending message to Discord:', error);
    }

}
