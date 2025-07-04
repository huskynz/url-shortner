'use client';
import { SessionProvider, useSession } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

function ForceSetPasswordRedirect({ children }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status !== 'authenticated' || !session?.user) {
      // Don't run redirect logic until session is loaded and user is defined
      return;
    }
    const isPassSet = session.user.passset === true || session.user.passset === 'true';
    console.log('REDIRECT CHECK:', {
      status,
      user: session.user,
      passset: session.user.passset,
      isPassSet,
      pathname
    });
    if (!isPassSet && pathname !== '/set-password') {
      router.replace('/set-password');
    }
  }, [session, status, pathname, router]);

  return children;
}

export default function Providers({ children }) {
  return (
    <SessionProvider>
      <ForceSetPasswordRedirect>{children}</ForceSetPasswordRedirect>
    </SessionProvider>
  );
} 