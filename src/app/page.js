import { redirectToUrl, logUserData } from './utils';

// Root URL handling
export default async function Page() {
    await logUserData("/");
    await redirectToUrl("/");
}
