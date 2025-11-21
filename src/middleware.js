import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import supabase, { getCachedData } from './app/lib/supabase';

const ADMIN_CACHE_TTL = 30 * 1000;
const ADMIN_TABLE = process.env.ADMINS_DB || 'github_admins';
const isNoRowError = (error) => error?.code === 'PGRST116' || error?.message?.includes('No rows');

async function isAdminFromToken(req) {
  const token = req.nextauth.token;
  if (!token?.id) return false;

  // Prefer admin flag baked into the JWT/session to avoid DB lookups
  if (token.isAdmin !== undefined) return token.isAdmin;
  if (token.role !== undefined) {
    return token.role === 'admin' || token.role === 'owner';
  }

  try {
    const admin = await getCachedData(
      `middleware-admin-${token.id}`,
      async () => {
        const { data, error } = await supabase
          .from(ADMIN_TABLE)
          .select('id, role')
          .eq('id', token.id)
          .single();

        if (error && !isNoRowError(error)) throw error;
        return data ?? null;
      },
      ADMIN_CACHE_TTL
    );

    return admin ? (admin.role ? (admin.role === 'admin' || admin.role === 'owner') : true) : false;
  } catch (error) {
    console.error('Cached admin lookup failed:', error);
    return false;
  }
}

export default withAuth(
  async function middleware(req) {
    const isAdmin = await isAdminFromToken(req);
    if (!isAdmin) {
      return NextResponse.redirect(new URL('/urls', req.url));
    }

    req.role = req.nextauth.token?.role;
    return NextResponse.next();
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
