// src/app/deprecated/page.js
export default function DeprecatedPage() {
  return (
    <div className="pt-16 flex flex-col items-center">
      <img src="https://serv.husky.nz/logo/default180.png" width={60} height={60} className="mb-6" alt="Logo" />
      <div className="max-w-xl text-center">
        <h1 className="text-3xl font-bold mb-4">Deprecated URL</h1>
        <div className="border border-red-500/20 bg-red-500/5 rounded-lg p-5 mb-5">
          <p className="text-gray-300 mb-2">This shortened URL has been deprecated and is no longer in use.</p>
          <p className="text-gray-400 text-sm">Please check the URLs page for an updated link.</p>
        </div>
        <div className="flex gap-4 justify-center">
          <a href="/urls" className="text-blue-500 hover:underline">View all URLs</a>
        </div>
      </div>
    </div>
  );
}