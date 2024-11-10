// src/app/invalid/page.js
export default function InvalidPage() {
    return (
      <div className="pt-16 flex flex-col items-center">
        <img src="https://serv.husky.nz/logo/default180.png" width={60} height={60} className="mb-6" alt="Logo" />
        <div className="max-w-xl text-center">
          <h1 className="text-3xl font-bold mb-4">Invalid URL</h1>
          <div className="border border-yellow-500/20 bg-yellow-500/5 rounded-lg p-5 mb-5">
            <p className="text-gray-300 mb-2">This shortened URL does not exist.</p>
            <p className="text-gray-400 text-sm">Please check the URLs page for available links.</p>
          </div>
          <div className="flex gap-4 justify-center">
            <a href="/urls" className="text-blue-500 hover:underline">View all URLs</a>
          </div>
        </div>
      </div>
    );
  }