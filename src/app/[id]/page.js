import { fetchRedirectUrl, logUserData } from '../utils';
import { redirect } from 'next/navigation';

export default async function Page(props) {
  const params = props.params;
  const { id } = params;

  await logUserData(id);

  const urlData = await fetchRedirectUrl(id);

  // Handle special routes like /deprecated, /invalidlink, /access-denied
  if (!urlData) {
    return null; // fetchRedirectUrl already redirects for these, or handles internally
  }

  // If the URL is private, redirect to the password protected page
  if (urlData.private && urlData.redirect_url === "/password-protected") {
    redirect(`/password-protected?path=${id}`);
  }

  // For all other valid URLs (non-private, non-special internal redirects), redirect to the target URL
  redirect(urlData.redirect_url);
}