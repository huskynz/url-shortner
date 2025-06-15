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
      <div className="flex justify-center items-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!urlDetails) {
    return null; // Will be redirected by useEffect
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-gray-200 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <LockClosedIcon className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <h1 className="text-2xl font-bold mb-2">Password Protected</h1>
          {urlDetails.custom_message ? (
            <p className="text-gray-400">{urlDetails.custom_message}</p>
          ) : (
            <p className="text-gray-400">This URL is password protected. Please enter the password to continue.</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:border-gray-600"
              required
            />
          </div>

          {error && (
            <div className="text-red-500 text-sm text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900"
          >
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}

export default function PasswordProtected() {
  return (
    <Suspense fallback={
      <div className="flex justify-center items-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    }>
      <PasswordProtectedContent />
    </Suspense>
  );
} 