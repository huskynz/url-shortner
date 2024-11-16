'use client';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function SignInContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  const callbackUrl = searchParams.get('callbackUrl') || '/admin';

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

        <div className="bg-[#111] border border-gray-800 rounded-lg p-6">
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded">
              <p className="text-red-500 text-center text-sm">
                {error === 'AccessDenied' 
                  ? 'You do not have permission to access this page.' 
                  : 'An error occurred while signing in.'}
              </p>
            </div>
          )}

          <button
            onClick={() => signIn('github', { callbackUrl })}
            className="w-full flex items-center justify-center gap-2 bg-blue-500/10 text-blue-500 px-4 py-2 rounded hover:bg-blue-500/20 transition-colors"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            Sign in with GitHub
          </button>
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