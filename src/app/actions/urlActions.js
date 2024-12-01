'use server';
import { createClient } from '@supabase/supabase-js';

// Don't throw errors for missing env vars in production
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export async function fetchUrls() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return [];  // Return empty array instead of throwing in production
  }

  try {
    const { data, error } = await supabase
      .from('shortened_urls')
      .select('*');
    
    if (error) {
      console.error('Supabase error:', error);
      return [];  // Return empty array on error
    }
    
    return data || [];
  } catch (error) {
    console.error('Fetch error:', error);
    return [];  // Return empty array on error
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