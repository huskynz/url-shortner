// [id]/page.tsx
import { fetchRedirectUrl, logUserData } from '../lib/utils';
import { redirect } from 'next/navigation';

interface PageProps {
  params: { id: string };
}

export default async function Page({ params }: PageProps): Promise<void> {
  const { id } = await params;
  await logUserData(id);

  const urlData = await fetchRedirectUrl(id);

  // Handle special routes
  if (!urlData) {
    return;
  }

  // For internal routes, use redirect without http/https
  if (urlData.deprecated) {
    redirect(`/deprecated?dpl=${id}`);
  }

  // For external URLs, keep the full URL
  redirect(urlData.redirect_url);
}
