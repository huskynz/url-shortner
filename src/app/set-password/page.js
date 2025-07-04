'use client';
import { useState } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function SetPasswordPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState(session?.user?.email || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  if (status === 'loading') return <div>Loading...</div>;
  if (!session) return <div>You must be logged in to set your email and password.</div>;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch('/api/auth/set-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        id: session?.user?.id,
        github_username: session?.user?.github_username,
        github_id: session?.user?.github_id,
      }),
      credentials: 'include',
    });
    setLoading(false);
    const data = await res.json();
    if (data.success) {
      setSuccess(true);
      await signIn('credentials', { email, password, callbackUrl: '/admin' });
    } else {
      setError(data.error || 'Failed to set email and password.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
      <div className="w-full max-w-md bg-[#111] border border-gray-800 rounded-lg p-8">
        <h1 className="text-2xl font-bold text-gray-200 mb-4">Set Email & Password</h1>
        <p className="text-gray-400 mb-6">To continue, please set your email and password for your account.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <input
              type="email"
              className="w-full p-2 rounded-lg bg-[#0a0a0a] border border-gray-800 text-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Password</label>
            <input
              type="password"
              className="w-full p-2 rounded-lg bg-[#0a0a0a] border border-gray-800 text-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors font-semibold"
            disabled={loading}
          >
            {loading ? 'Saving...' : 'Set Email & Password'}
          </button>
        </form>
        {error && <div className="mt-4 text-red-500 text-center">{error}</div>}
        {success && <div className="mt-4 text-green-500 text-center">Email and password set! Redirecting...</div>}
      </div>
    </div>
  );
} 