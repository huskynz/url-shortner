'use client';
import { useState, useEffect } from 'react';
import { MobileIcon, DesktopIcon } from '@radix-ui/react-icons';
import { useDeviceDetect } from '../hooks/useDeviceDetect';
import { useRole } from '../hooks/useRole';
import NoAccessDialog from '../components/NoAccessDialog';
import { useSession, signIn, signOut } from 'next-auth/react';

export default function UrlList({ initialUrls }) {
    const [urls, setUrls] = useState(initialUrls);
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [showNoAccess, setShowNoAccess] = useState(false);
    const isMobileView = useDeviceDetect();
    const { isAdmin, isOwner } = useRole();

    const handleAction = (action) => {
        if (!isAdmin && !isOwner) {
            setShowNoAccess(true);
            return;
        }
        action();
    };

    const filteredUrls = urls
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
        <div className="flex flex-col min-h-screen p-8">
            <div className="flex items-center justify-between gap-4">
                {/* Left section: Logo and text */}
                <div className="flex items-center gap-4 pb-5">
                    <img 
                        src={process.env.NEXT_PUBLIC_LOGO_URL} 
                        width={50} 
                        height={50} 
                        alt="Logo"
                        className="rounded"
                    />
                    <div className=''>
                        <h1 className="text-2xl font-bold">HuskyNZ URL Shortner</h1>
                        <p className=" text-gray-400">
                            Version: {process.env.NEXT_PUBLIC_Version_Number} | Environment:{" "}<span className={`${ process.env.NEXT_PUBLIC_ENV === "Development" ? "uppercase text-red-500" : "text-green-400" }`}> {process.env.NEXT_PUBLIC_ENV}</span>
                        </p>
                    </div>
                </div>
                
                {/* Right section: Sign-in button */}
                <button 
                    onClick={() => signIn()} 
                    className="bg-green-500/10 text-green-500 px-4 py-2 rounded hover:bg-green-500/20 text-sm"
                >
                    Sign In
                </button>
            </div>
            <div className={`${isMobileView ? 'flex flex-col gap-4' : 'flex gap-4'} mb-4`}>
                <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="p-2 rounded bg-transparent border border-gray-700 text-gray-300 focus:outline-none focus:border-gray-500"
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
                    className="flex-1 p-2 border rounded bg-transparent border-gray-700 text-gray-300 placeholder-gray-400 focus:outline-none focus:border-gray-500"
                />
            </div>

            <div className={`grid gap-4 ${isMobileView ? 'max-w-sm mx-auto' : ''}`}>
                {filteredUrls.map((url) => (
                    <div 
                        key={url.short_path} 
                        className="border border-gray-700 p-4 rounded-lg transition-all duration-200 hover:border-gray-600"
                    >
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="text-lg text-gray-200">/{url.short_path}</h3>
                                    <span className={`text-xs px-2 py-0.5 rounded ${
                                        url.deprecated 
                                            ? 'bg-yellow-500/10 text-yellow-500' 
                                            : 'bg-green-500/10 text-green-500'
                                    }`}>
                                        {url.deprecated ? 'Deprecated' : 'Active'}
                                    </span>
                                </div>
                                <a 
                                    href={url.redirect_url} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="text-sm text-gray-400 hover:text-gray-300"
                                >
                                    {url.redirect_url}
                                </a>
                            </div>
                            <a
                                href={`/${url.short_path}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1.5 rounded text-sm bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
                            >
                                Visit
                            </a>
                        </div>
                    </div>
                ))}
            </div>

            <NoAccessDialog 
                isOpen={showNoAccess} 
                onClose={() => setShowNoAccess(false)} 
            />

            {/* Footer */}
            <footer className="mt-auto text-center text-gray-500">
                <p >© 2025 HuskyNZ. Licensed under the MIT open source lisense <a className='text-white  underline' href='https://raw.githubusercontent.com/huskynz/url-shortner/refs/heads/master/LICENSE'>here</a> | You can view this sites source code <a href='/ghm' className='text-white  underline'>here</a></p>
                <p>By using this site you agree to HuskyNZ's <a href='https://legal.husky.nz/toc' className='text-white underline'>Terms of use</a> and <a href='https://legal.husky.nz/Privacy-Policy' className='text-white underline'>Privacy policy</a></p>
            </footer>
        </div>
    );
}
