'use client';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

function SignInContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  const callbackUrl = searchParams.get('callbackUrl') || '/admin';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleCredentialsSignIn = async (e) => {
    e.preventDefault();
    setFormError(null);
    setLoading(true);
    const res = await signIn('credentials', {
      email,
      password,
      callbackUrl,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setFormError('Invalid email or password.');
    } else if (res?.ok) {
      window.location.href = callbackUrl;
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center pt-20 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img 
            src="https://serv.husky.nz/logo/default180.png" 
            width={80} 
            height={80} 
            alt="Logo"
            className="rounded mx-auto mb-6"
          />
          <h1 className="text-2xl font-bold text-gray-200">Admin Access Required</h1>
          <p className="text-gray-400 mt-2">Sign in to continue to dashboard</p>
        </div>

        <div className="bg-[#111] border border-gray-800 rounded-lg p-6 space-y-6">
          {(error || formError) && (
            <div className="mb-2 p-4 bg-red-500/10 border border-red-500/20 rounded">
              <p className="text-red-500 text-center text-sm">
                {error === 'AccessDenied' 
                  ? 'You do not have permission to access this page.' 
                  : formError || 'An error occurred while signing in.'}
              </p>
            </div>
          )}

          <form onSubmit={handleCredentialsSignIn} className="space-y-4">
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
                autoComplete="current-password"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors font-semibold"
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign in with Email'}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}

export default function SignIn() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    }>
      <SignInContent />
    </Suspense>
  );
} 
