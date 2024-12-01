import UrlPageClient from './UrlPageClient';
import { fetchDisplayUrls, logUserData } from '../utils';

export default async function UrlsPage() {
  const urls = await fetchDisplayUrls();
  await logUserData("urls");
  return <UrlPageClient initialUrls={urls} />;
}