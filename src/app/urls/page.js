import { fetchDisplayUrls } from '../utils';

export default async function UrlsPage() {
  const urls = await fetchDisplayUrls();
  
  // Sort URLs alphabetically by short_path
  const sortedUrls = urls.sort((a, b) => 
    a.short_path.localeCompare(b.short_path)
  );

  return (
    <div className="p-8">
      <center>
      <img src="https://serv.husky.nz/logo/default180.png" width={50} height={50} />
      <h1 className="text-2xl font-bold mb-6">Shortened URLs</h1>
      </center>
      <div className="grid gap-4">
        {sortedUrls.map((url) => (
          <div key={url.short_path} className="border p-4 rounded-lg">
            <p className="font-mono">Short Path: {url.short_path}</p>
            <p className="text-gray-600">Redirects to: <a href={url.redirect_url}>{url.redirect_url}</a></p>
          </div>
        ))}
      </div>
    </div>
  );
}