import NextAuth from 'next-auth';
import GithubProvider from 'next-auth/providers/github';
import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

const ALLOWED_USERS = ['Husky-Devel']; // Updated to your exact GitHub username

export const authOptions = {
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ user, profile }) {
      // Use profile.login to get the exact GitHub username
      return ALLOWED_USERS.includes(profile.login);
    },
    async session({ session, token }) {
      if (session?.user) {
        session.user.username = token.username;
      }
      return session;
    },
    async jwt({ token, profile }) {
      if (profile) {
        token.username = profile.login;
      }
      return token;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };

export default withAuth(
  function middleware(req) {
    // Proceed with the request if authenticated
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => token?.username === 'Husky-Devel', // Replace with your GitHub username
    },
  }
);

export const config = {
  matcher: ['/admin/:path*']
}; 