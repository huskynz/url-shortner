import { getToken } from 'next-auth/jwt';
import GithubProvider from 'next-auth/providers/github';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import supabase, { getCachedData } from './supabase';

const ADMIN_CACHE_TTL = 30 * 1000;

const isNoRowError = (error) => error?.code === 'PGRST116' || error?.message?.includes('No rows');

async function getAdminById(id) {
  if (!id) return null;

  return getCachedData(
    `admin-id-${id}`,
    async () => {
      const { data, error } = await supabase
        .from('github_admins')
        .select('*')
        .eq('id', id)
        .single();

      if (error && !isNoRowError(error)) throw error;
      return data ?? null;
    },
    ADMIN_CACHE_TTL
  );
}

async function getAdminByEmail(email) {
  if (!email) return null;

  return getCachedData(
    `admin-email-${email.toLowerCase()}`,
    async () => {
      const { data, error } = await supabase
        .from('github_admins')
        .select('*')
        .eq('email', email)
        .single();

      if (error && !isNoRowError(error)) throw error;
      return data ?? null;
    },
    ADMIN_CACHE_TTL
  );
}

async function getAdminByUsername(username) {
  if (!username) return null;

  const normalized = username.toLowerCase();
  return getCachedData(
    `admin-username-${normalized}`,
    async () => {
      const { data, error } = await supabase
        .from('github_admins')
        .select('*')
        .ilike('github_username', normalized)
        .single();

      if (error && !isNoRowError(error)) throw error;
      return data ?? null;
    },
    ADMIN_CACHE_TTL
  );
}

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
        const user = await getAdminByEmail(credentials.email);
        console.log('CREDENTIALS LOGIN:', { email: credentials.email, user });
        if (!user || !user.password) return null;
        const isValid = await bcrypt.compare(credentials.password, user.password);
        console.log('PASSWORD VALID:', isValid);
        if (!isValid) return null;
        return {
          id: user.id,
          email: user.email,
          role: user.role,
          isAdmin: true,
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
        const admin = await getAdminByUsername(profile.login);
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
          const emailUser = await getAdminByEmail(profile.email);
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
        session.user.isAdmin = token.isAdmin ?? !!token.role;
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
        token.isAdmin = user.isAdmin ?? !!user.role;
        token.github_id = user.github_id;
        token.github_username = user.github_username;
        token.email = user.email;
        token.password_hash = user.password_hash;
        token.passset = user.passset;
      }
      // If GitHub login, fetch user info from DB
      if (account?.provider === 'github' && profile) {
        const admin = await getAdminByUsername(profile.login);
        if (admin) {
          token.id = admin.id;
          token.role = admin.role;
          token.isAdmin = true;
          token.github_id = admin.github_id;
          token.github_username = admin.github_username;
          token.email = admin.email;
          token.password_hash = admin.password_hash;
          token.passset = admin.passset;
        } else {
          token.isAdmin = false;
        }
      }
      token.isAdmin = token.isAdmin ?? !!token.role;
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
      if (token.isAdmin !== undefined) return token.isAdmin;
      if (token.role !== undefined) return !!token.role;
      const admin = await getAdminById(token.id);
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
