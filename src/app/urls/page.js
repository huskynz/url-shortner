// page.js (Server Component)
import UrlList from './UrlList'; // Remove the curly braces
import { fetchDisplayUrls, logUserData } from '../utils';

export default async function UrlsPage() {
  const urls = await fetchDisplayUrls();
  await logUserData("urls");
  return <UrlList initialUrls={urls} />;
}