'use client';
import { useState, useEffect } from 'react';
import { MobileIcon, DesktopIcon } from '@radix-ui/react-icons';
import { useDeviceDetect } from '../hooks/useDeviceDetect';

export default function UrlList({ initialUrls }) {
    const isMobileDevice = useDeviceDetect();
    const [isMobileView, setIsMobileView] = useState(true);
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');

    useEffect(() => {
        setIsMobileView(isMobileDevice);
    }, [isMobileDevice]);

    const filteredUrls = initialUrls
        .sort((a, b) => a.short_path.localeCompare(b.short_path))
        .filter(url => {
            if (filter === 'deprecated' && !url.deprecated) return false;
            if (filter === 'active' && url.deprecated) return false;
            
            if (search) {
                const searchLower = search.toLowerCase();
                return (
                    url.short_path.toLowerCase().includes(searchLower) ||
                    url.redirect_url.toLowerCase().includes(searchLower)
                );
            }
            return true;
        });

    return (
        <div className="max-w-7xl mx-auto p-4">
            <div className={`${isMobileView ? 'flex flex-col items-center' : 'flex justify-between items-center'} mb-6`}>
                <div className="flex items-center gap-4">
                    <img 
                        src="https://serv.husky.nz/logo/default180.png" 
                        width={50} 
                        height={50} 
                        alt="Logo"
                        className="rounded"
                    />
                    <h1 className="text-2xl font-bold">Shortened URLs</h1>
                </div>

                <button
                    onClick={() => setIsMobileView(!isMobileView)}
                    className="mt-4 flex items-center gap-2 px-3 py-1.5 rounded bg-gray-800 text-gray-300 hover:bg-gray-700 text-sm"
                >
                    {isMobileView ? (
                        <>
                            <MobileIcon className="w-4 h-4" />
                            Mobile View
                        </>
                    ) : (
                        <>
                            <DesktopIcon className="w-4 h-4" />
                            Desktop View
                        </>
                    )}
                </button>
            </div>

            <div className={`${isMobileView ? 'flex flex-col gap-4' : 'flex gap-4'} mb-4`}>
                <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className={`p-2 rounded bg-transparent border border-gray-700 text-gray-300 focus:outline-none focus:border-gray-500
                        ${isMobileView ? 'w-full' : 'w-[200px]'}`}
                >
                    <option value="all">All URLs</option>
                    <option value="active">Active URLs</option>
                    <option value="deprecated">Deprecated URLs</option>
                </select>

                <input
                    type="text"
                    placeholder="Search URLs..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full p-2 border rounded bg-gray-800 border-gray-700 text-gray-300 placeholder-gray-400 focus:outline-none focus:border-gray-500"
                />
            </div>

            <div className={`grid gap-4 ${isMobileView ? 'max-w-sm mx-auto' : ''}`}>
                {filteredUrls.length > 0 ? (
                    filteredUrls.map((url) => (
                        <div 
                            key={url.short_path} 
                            className="border border-gray-700 p-4 rounded-lg transition-all duration-200 hover:border-gray-600"
                        >
                            {isMobileView ? (
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <div className="flex flex-col gap-2">
                                            <p className="font-mono text-sm break-all">/{ url.short_path }</p>
                                            <p className="text-gray-400 text-sm break-all">
                                                Redirects to: <a href={url.redirect_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                                                    {url.redirect_url}
                                                </a>
                                            </p>
                                        </div>
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                            url.deprecated 
                                                ? 'bg-red-500/10 text-red-500' 
                                                : 'bg-green-500/10 text-green-500'
                                        }`}>
                                            {url.deprecated ? 'Deprecated' : 'Active'}
                                        </span>
                                    </div>
                                    <a 
                                        href={`/${url.short_path}`}
                                        className="block w-full bg-blue-500/10 text-blue-500 py-2 rounded hover:bg-blue-500/20 text-center"
                                    >
                                        Visit
                                    </a>
                                </div>
                            ) : (
                                <div className="flex items-center justify-between">
                                    <div className="flex-1 pr-4">
                                        <div className="flex items-center gap-2">
                                            <p className="font-mono text-sm">/{ url.short_path }</p>
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                                url.deprecated 
                                                    ? 'bg-red-500/10 text-red-500' 
                                                    : 'bg-green-500/10 text-green-500'
                                            }`}>
                                                {url.deprecated ? 'Deprecated' : 'Active'}
                                            </span>
                                        </div>
                                        <p className="text-gray-400 text-sm truncate">
                                            {url.redirect_url}
                                        </p>
                                    </div>
                                    <a 
                                        href={`/${url.short_path}`}
                                        className="px-3 py-1.5 text-sm bg-blue-500/10 text-blue-500 rounded hover:bg-blue-500/20 inline-block text-center"
                                    >
                                        Visit
                                    </a>
                                </div>
                            )}
                        </div>
                    ))
                ) : (
                    <div className="text-center py-8 text-gray-400">
                        {search ? (
                            <p>No URLs found matching "{search}"</p>
                        ) : (
                            <p>No URLs found</p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}