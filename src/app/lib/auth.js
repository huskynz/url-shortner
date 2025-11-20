import { getToken } from 'next-auth/jwt';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import supabase, { getCachedData } from './supabase';

const ADMIN_CACHE_TTL = 30 * 1000;
const ADMIN_TABLE = process.env.ADMINS_DB || 'github_admins';

const isNoRowError = (error) => error?.code === 'PGRST116' || error?.message?.includes('No rows');

async function getAdminById(id) {
  if (!id) return null;

  return getCachedData(
    `admin-id-${id}`,
    async () => {
      const { data, error } = await supabase
        .from(ADMIN_TABLE)
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
        .from(ADMIN_TABLE)
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
        .from(ADMIN_TABLE)
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
        if (!user) return null;
        const passwordHash = user.password_hash || user.password;
        if (!passwordHash) return null;
        const isValid = await bcrypt.compare(credentials.password, passwordHash);
        if (!isValid) return null;
        const role = user.role || (user.isAdmin ? 'admin' : null);
        return {
          id: user.id,
          email: user.email,
          role,
          isAdmin: true,
          passset: user.passset,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      // CredentialsProvider: user is already validated
      return !!user;
    },
    async session({ session, token, user }) {
      if (session?.user) {
        session.user.id = token.id;
        const role = token.role || (token.isAdmin ? 'admin' : null);
        session.user.role = role;
        session.user.isAdmin = token.isAdmin ?? (role ? role === 'admin' || role === 'owner' : false);
        session.user.email = token.email;
        session.user.passset = token.passset ?? false;
      }
      return session;
    },
    async jwt({ token, user, account, profile }) {
      // On login, merge user info into token
      if (user) {
        const role = user.role || (user.isAdmin ? 'admin' : null);
        token.id = user.id;
        token.role = role;
        token.isAdmin = user.isAdmin ?? (role ? role === 'admin' || role === 'owner' : false);
        token.email = user.email;
        token.passset = user.passset;
      }
      token.isAdmin = token.isAdmin ?? (token.role ? token.role === 'admin' || token.role === 'owner' : false);
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
      if (token.role !== undefined) {
        return token.role === 'admin' || token.role === 'owner';
      }
      const admin = await getAdminById(token.id);
      const isAdmin = !admin ? false : (admin.role ? (admin.role === 'admin' || admin.role === 'owner') : true);
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

export async function requireAdminSession(req, { requireOwner = false } = {}) {
  try {
    const token = await getToken({ req });
    if (!token?.id) {
      return { ok: false, status: 401, error: 'Unauthorized' };
    }

    let role = token.role || (token.isAdmin ? 'admin' : null);
    if (!role) {
      const admin = await getAdminById(token.id);
      role = admin?.role || (admin ? 'admin' : null);
    }
    const isAdminRole = role === 'admin' || role === 'owner';
    if (!isAdminRole) {
      return { ok: false, status: 403, error: 'Forbidden' };
    }
    if (requireOwner && role !== 'owner') {
      return { ok: false, status: 403, error: 'Owner role required' };
    }

    return { ok: true, token, role };
  } catch (error) {
    console.error('requireAdminSession failed:', error);
    return { ok: false, status: 500, error: 'Internal error' };
  }
}
