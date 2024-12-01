import NextAuth from 'next-auth';
import GithubProvider from 'next-auth/providers/github';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const handler = NextAuth({
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ user, profile }) {
      try {
        const { data: admin } = await supabase
          .from('github_admins')
          .select('role')
          .eq('github_username', profile.login)
          .single();

        return !!admin; // Returns true if user exists in github_admins table, false otherwise
      } catch (error) {
        console.error('Error checking admin status:', error);
        return false;
      }
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
});

export { handler as GET, handler as POST }; 