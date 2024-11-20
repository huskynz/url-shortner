import { getToken } from 'next-auth/jwt';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function verifyAuth(req) {
  const token = await getToken({ req });
  
  if (!token?.username) {
    return false;
  }

  try {
    const { data: admin } = await supabase
      .from('github_admins')
      .select('role')
      .eq('github_username', token.username)
      .single();

    return !!admin;
  } catch (error) {
    console.error('Auth verification failed:', error);
    return false;
  }
} 