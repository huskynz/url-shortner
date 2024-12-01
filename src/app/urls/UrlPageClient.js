'use client';
import { useSession } from 'next-auth/react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import UrlList from './UrlList';

export default function UrlPageClient({ initialUrls }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session?.user?.username === 'Husky-Devel') {
      router.push('/admin');
    }
  }, [session, router]);

  if (status === 'loading') {
    return <div>Loading...</div>;
  }

  return <UrlList initialUrls={initialUrls} />;
} 