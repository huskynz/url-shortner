import NextAuth from 'next-auth';
import GithubProvider from 'next-auth/providers/github';

const handler = NextAuth({
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ user, profile }) {
      return profile.login === 'Husky-Devel';
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