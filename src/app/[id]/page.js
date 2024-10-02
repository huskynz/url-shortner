import { redirectToUrl, logUserData } from '../utils';

// Dynamic page handling
export default async function Page({ params }) {
  const { id } = params;  // Get the dynamic id from the URL

  await logUserData(id);
  await redirectToUrl(id);
}
