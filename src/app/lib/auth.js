import { createClient } from '@supabase/supabase-js';
import { getToken } from 'next-auth/jwt';
import GithubProvider from 'next-auth/providers/github';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const authOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email', placeholder: 'email@example.com' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const { data: user, error } = await supabase
          .from('github_admins')
          .select('*')
          .eq('email', credentials.email)
          .single();
        console.log('CREDENTIALS LOGIN:', { email: credentials.email, user, error });
        if (error || !user || !user.password) return null;
        const isValid = await bcrypt.compare(credentials.password, user.password);
        console.log('PASSWORD VALID:', isValid);
        if (!isValid) return null;
        return {
          id: user.id,
          email: user.email,
          role: user.role,
          github_id: user.github_id,
          github_username: user.github_username,
          passset: user.passset,
        };
      },
    }),
    GithubProvider({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account.provider === 'github') {
        // Legacy behavior: only check for github_username (case-insensitive)
        const { data: admin } = await supabase
          .from('github_admins')
          .select('*')
          .ilike('github_username', profile.login) // case-insensitive match
          .single();
        console.log('GITHUB SIGNIN (LEGACY):', { profile, admin });
        if (admin) {
          // Inject github_id if missing
          if (!admin.github_id && profile.id) {
            await supabase
              .from('github_admins')
              .update({ github_id: String(profile.id) })
              .eq('github_username', admin.github_username);
            console.log('Injected github_id for', admin.github_username, '->', profile.id);
          }
          return true;
        }
        // Optionally: auto-link GitHub to existing email user if emails match
        if (profile.email) {
          const { data: emailUser } = await supabase
            .from('github_admins')
            .select('*')
            .eq('email', profile.email)
            .single();
          if (emailUser) {
            await supabase
              .from('github_admins')
              .update({ github_username: profile.login, github_id: String(profile.id) })
              .eq('id', emailUser.id);
            console.log('Linked github_username and injected github_id for', profile.email, '->', profile.login, profile.id);
            return true;
          }
        }
        return false;
      }
      // CredentialsProvider: user is already validated
      return !!user;
    },
    async session({ session, token, user }) {
      if (session?.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.github_id = token.github_id;
        session.user.github_username = token.github_username;
        session.user.email = token.email;
        session.user.password_hash = token.password_hash;
        session.user.passset = token.passset ?? false;
      }
      console.log('SESSION CALLBACK:', { token, session });
      return session;
    },
    async jwt({ token, user, account, profile }) {
      // On login, merge user info into token
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.github_id = user.github_id;
        token.github_username = user.github_username;
        token.email = user.email;
        token.password_hash = user.password_hash;
        token.passset = user.passset;
      }
      // If GitHub login, fetch user info from DB
      if (account?.provider === 'github' && profile) {
        const { data: admin } = await supabase
          .from('github_admins')
          .select('*')
          .ilike('github_username', profile.login)
          .single();
        if (admin) {
          token.id = admin.id;
          token.role = admin.role;
          token.github_id = admin.github_id;
          token.github_username = admin.github_username;
          token.email = admin.email;
          token.password_hash = admin.password_hash;
          token.passset = admin.passset;
        }
      }
      console.log('JWT CALLBACK:', { token, user, account, profile });
      return token;
    },
  },
};

export async function verifyAuth(req) {
  try {
    // First check for API key in the request headers
    const apiKey = req.headers.get('x-api-key');
    if (apiKey) {
      try {
        // Fetch all active API keys with valid expiration
        const { data: keys, error } = await supabase
          .from(process.env.APIKEY_DB)
          .select('*')
          .eq('is_active', true)
          .gt('expires_at', new Date().toISOString()); // Check for keys that are still valid

        if (error) {
          console.error('Error fetching API keys:', error);
          return false;
        }

        if (!keys || keys.length === 0) {
          console.error('No active API keys found');
          return false;
        }

        // Look for a matching key
        const matchingKey = keys.find(k => k.key === apiKey);

        if (matchingKey) {
          // If a match is found, update the usage metadata
          const { error: updateError } = await supabase
            .from(process.env.APIKEY_DB)
            .update({
              use_count: matchingKey.use_count + 1,
              last_used: new Date().toISOString(),
              last_ip: req.headers.get('x-forwarded-for') || req.ip,
              metadata: {
                ...matchingKey.metadata,
                last_user_agent: req.headers.get('user-agent'),
              },
            })
            .eq('id', matchingKey.id);

          if (updateError) {
            console.error('Error updating API key usage:', updateError);
          }

          return true;
        } else {
          console.error('Invalid API key used');
          return false;
        }
      } catch (error) {
        console.error('API key verification failed:', error);
        return false;
      }
    }

    // Fall back to session auth for admin routes if no API key is provided
    try {
      const token = await getToken({ req });
      if (!token?.id) {
        console.error('No user id in token');
        return false;
      }
      // Check if the user is an admin
      const { data: admin, error: adminError } = await supabase
        .from('github_admins')
        .select('role')
        .eq('id', token.id)
        .single();
      if (adminError) {
        console.error('Error checking admin status:', adminError);
        return false;
      }
      // Return true if the user has an admin role
      const isAdmin = !!admin;
      if (!isAdmin) {
        console.error('User is not an admin:', token.id);
      }
      return isAdmin;
    } catch (error) {
      console.error('Session auth failed:', error);
      return false;
    }
  } catch (error) {
    console.error('Error in verifyAuth:', error);
    return false;
  }
}
