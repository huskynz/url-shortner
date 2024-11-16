import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => token?.username === 'Husky-Devel', // Updated to your exact GitHub username
    },
  }
);

export const config = {
  matcher: ['/admin/:path*']
}; 