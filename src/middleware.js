import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default withAuth(
  async function middleware(req) {
    const username = req.nextauth.token?.username;
    if (!username) return false;

    try {
      const { data } = await supabase
        .from('allowed_admins')
        .select('github_username')
        .eq('github_username', username)
        .single();

      return data ? NextResponse.next() : NextResponse.redirect(new URL('/urls', req.url));
    } catch (error) {
      console.error('Admin check failed:', error);
      return NextResponse.redirect(new URL('/urls', req.url));
    }
  },
  {
    callbacks: {
      authorized: ({ token }) => token?.username ? true : false,
    },
  }
);

export const config = {
  matcher: ['/admin/:path*']
}; 