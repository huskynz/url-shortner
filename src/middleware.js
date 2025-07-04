import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export default withAuth(
  async function middleware(req) {
    const userId = req.nextauth.token?.id;
    if (!userId) return false;

    try {
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        }
      );

      const { data } = await supabase
        .from('github_admins')
        .select('id, role')
        .eq('id', userId)
        .single();

      if (!data) {
        return NextResponse.redirect(new URL('/urls', req.url));
      }

      req.role = data.role;
      return NextResponse.next();
    } catch (error) {
      console.error('Admin check failed:', error);
      return NextResponse.redirect(new URL('/urls', req.url));
    }
  },
  {
    callbacks: {
      authorized: ({ token }) => token?.id ? true : false,
    },
  }
);

export const config = {
  matcher: ['/admin/:path*']
}; 