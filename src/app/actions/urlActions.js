'use server';
import { createClient } from '@supabase/supabase-js';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_URL');
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing env.SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export async function fetchUrls() {
  try {
    const { data, error } = await supabase
      .from('shortened_urls')
      .select('*');
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching URLs:', error);
    throw error;
  }
}

export async function addUrl(shortPath, redirectUrl) {
  try {
    const { error } = await supabase
      .from('shortened_urls')
      .insert([{ 
        short_path: shortPath, 
        redirect_url: redirectUrl,
        deprecated: false // Set default value
      }]);
    
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error adding URL:', error);
    throw error;
  }
}

export async function toggleDeprecated(shortPath, currentState) {
  try {
    const { error } = await supabase
      .from('shortened_urls')
      .update({ deprecated: !currentState })
      .eq('short_path', shortPath);
    
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error toggling deprecated status:', error);
    throw error;
  }
}

export async function deleteUrl(shortPath) {
  try {
    const { error } = await supabase
      .from('shortened_urls')
      .delete()
      .eq('short_path', shortPath);
    
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting URL:', error);
    throw error;
  }
} 