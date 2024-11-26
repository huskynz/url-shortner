// app/redirectUtils.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

const supabaseUrl = process.env.SUPABASE_URL as string;
const supabaseKey = process.env.SUPABASE_KEY as string;

const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);

interface RedirectUrlData {
  redirect_url: string;
  deprecated: boolean;
  short_path?: string;
}

export async function fetchRedirectUrl(location: string): Promise<RedirectUrlData | null> {
  // Special routes - don't redirect
  if (location === 'invaildlink' || location === 'deprecated' || location === 'urls') {
    return null;
  }

  const { data, error } = await supabase
    .from('shortened_urls')
    .select('redirect_url, deprecated, short_path')
    .eq('short_path', location)
    .single();

  if (error || !data) {
    return {
      redirect_url: '/invaildlink',
      deprecated: false,
    };
  }

  if (data.deprecated) {
    return {
      redirect_url: `/deprecated?dpl=${location}`,
      deprecated: true,
    };
  }

  return {
    redirect_url: data.redirect_url,
    deprecated: false,
  };
}

export async function redirectToUrl(location: string): Promise<void> {
  const urlData = await fetchRedirectUrl(location);
  if (!urlData) {
    return; // Don't redirect special routes
  }
  redirect(urlData.redirect_url);
}

export async function addUrl(shortPath: string, redirectUrl: string): Promise<boolean> {
  const { error } = await supabase
    .from('shortened_urls')
    .insert({ short_path: shortPath, redirect_url: redirectUrl });
  if (error) console.error('Error adding URL:', error);
  return !error;
}

export async function deleteUrl(shortPath: string): Promise<boolean> {
  const { error } = await supabase
    .from('shortened_urls')
    .delete()
    .eq('short_path', shortPath);
  if (error) console.error('Error deleting URL:', error);
  return !error;
}

export async function fetchDisplayUrls(): Promise<RedirectUrlData[]> {
  const { data, error } = await supabase
    .from('shortened_urls')
    .select('short_path, redirect_url, deprecated');
  if (error) {
    console.error('Error fetching URLs:', error);
    return [];
  }

  return data || [];
}

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL as string;

export async function logUserData(location: string): Promise<void> {
  const header = await headers();

  const ip = header.get('x-forwarded-for') || 'Unknown IP'; // Fallback if IP is not found
  const userAgent = header.get('user-agent') || 'Unknown';
  const ipInfoUrl = 'https://whatismyipaddress.com/ip';
  const payload = {
    content: `
        🚨 New visitor detected!
        **IP Address**: ${ip}
        **User-Agent**: ${userAgent}
        **Redirect**: ${location}
        **Ip Info**: ${ipInfoUrl}/${ip}
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
