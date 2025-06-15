'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { LockClosedIcon } from '@radix-ui/react-icons';
import { fetchUrlByShortPath } from '../actions/urlActions'; // Import the server action
import LoadingSpinner from '../components/LoadingSpinner'; // Assuming you have this component

function PasswordProtectedContent() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [urlDetails, setUrlDetails] = useState(null);
  const [loadingUrl, setLoadingUrl] = useState(true);
  const searchParams = useSearchParams();
  const router = useRouter();
  const shortPath = searchParams.get('path');

  useEffect(() => {
    if (!shortPath) {
      router.push('/invaildlink'); // Redirect if no shortPath is provided
      return;
    }

    const loadUrlDetails = async () => {
      setLoadingUrl(true);
      const data = await fetchUrlByShortPath(shortPath);
      setUrlDetails(data);
      setLoadingUrl(false);

      // Handle redirection based on fetched data
      if (!data) {
        router.push('/invaildlink');
      } else if (data.deprecated) {
        router.push(`/deprecated?dpl=${shortPath}`);
      } else if (!data.private) {
        router.push(data.redirect_url); // Directly redirect if not private
      }
    };

    loadUrlDetails();
  }, [shortPath, router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const response = await fetch('/api/verify-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          short_path: shortPath,
          password: password,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        router.push(data.redirect_url);
      } else {
        setError(data.error || 'Invalid password');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    }
  };

  if (loadingUrl) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!urlDetails) {
    return null; // Will be redirected by useEffect
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] px-4">
      <div className="max-w-md w-full space-y-8 bg-[#1a1a1a] p-8 rounded-xl border border-gray-800">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-blue-500/10">
            <LockClosedIcon className="h-6 w-6 text-blue-500" />
          </div>
          <h2 className="mt-6 text-2xl font-bold text-gray-200">
            Password Protected
          </h2>
          {urlDetails.custom_message ? (
            <p className="mt-2 text-sm text-gray-400">{urlDetails.custom_message}</p>
          ) : (
            <p className="mt-2 text-sm text-gray-400">
              The URL <span className="font-semibold text-gray-300">/{shortPath}</span> is password protected. Please enter the password to continue.
            </p>
          )}
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="password" className="sr-only">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="appearance-none relative block w-full px-3 py-2 border border-gray-800 rounded-lg bg-[#0a0a0a] text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter password"
            />
          </div>

          {error && (
            <div className="text-sm text-red-500 text-center">{error}</div>
          )}

          <div>
            <button
              type="submit"
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent rounded-lg text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              Continue
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PasswordProtected() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <LoadingSpinner size="lg" />
      </div>
    }>
      <PasswordProtectedContent />
    </Suspense>
  );
} 