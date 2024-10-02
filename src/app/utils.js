// app/redirectUtils.js
import { createClient } from '@supabase/supabase-js';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';


const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

// Function to fetch the redirect URL from Supabase
export async function fetchRedirectUrl(location) {
  const { data, error } = await supabase
    .from("shortened_urls")
    .select("redirect_url")
    .eq("short_path", location)
    .single();

  console.log(data);

  if (error || !data) {
    console.error("Error fetching URL from Supabase:", error);
    return "https://www.husky.nz";  // Fallback URL in case of error or missing path
  }

  return data.redirect_url;
}

// Function to handle redirection
export async function redirectToUrl(location) {
  const url = await fetchRedirectUrl(location);
  redirect(url);
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
