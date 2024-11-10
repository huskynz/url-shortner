'use client';
import { useState } from 'react';

export default function UrlList({ initialUrls }) {
    const [filter, setFilter] = useState('all');

    const filteredUrls = initialUrls
        .sort((a, b) => a.short_path.localeCompare(b.short_path))
        .filter(url => {
            if (filter === 'deprecated') return url.deprecated;
            if (filter === 'active') return !url.deprecated;
            return true;
        });

    return (
        <div className="p-8">
            <center>
                <img src="https://serv.husky.nz/logo/default180.png" width={50} height={50} />
                <h1 className="text-2xl font-bold mb-6">Shortened URLs</h1>
            </center>

            <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="mb-4 p-2 rounded bg-transparent border border-gray-700 text-gray-300 w-full max-w-xs focus:outline-none focus:border-gray-500"
            >
                <option value="all">All URLs</option>
                <option value="active">Active URLs</option>
                <option value="deprecated">Deprecated URLs</option>
            </select>

            <div className="grid gap-4">
                {filteredUrls.map((url) => (
                    <a key={url.short_path} href={`/${url.short_path}`} className="block transition-all duration-200 hover:transform hover:scale-[1.01]">
                        <div className="border p-4 rounded-lg shadow-sm hover:shadow-md hover:border-gray-300 transition-all duration-200">
                            <p className="font-mono">Short Path: {url.short_path}</p>
                            <p className="text-gray-600">Redirects to: <span className="text-blue-600 hover:underline">{url.redirect_url}</span></p>
                            <p className="text-sm">Deprecated: <span className={`ml-2 px-2 py-1 rounded-full text-xs font-semibold ${url.deprecated ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"}`}>{url.deprecated ? "Yes" : "No"}</span></p>
                        </div>
                    </a>
                ))}
            </div>
        </div>
    );
}