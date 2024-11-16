'use client';
import { useState, useEffect } from 'react';
import { MobileIcon, DesktopIcon } from '@radix-ui/react-icons';
import { useDeviceDetect } from '../hooks/useDeviceDetect';
import { useRole } from '../hooks/useRole';
import NoAccessDialog from '../components/NoAccessDialog';

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
        <div className="p-8">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">URLs</h1>
                <button
                    onClick={() => handleAction(() => setShowAddUrlDialog(true))}
                    className="px-4 py-2 rounded bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
                >
                    Add URL
                </button>
            </div>

            <div className={`${isMobileView ? 'flex flex-col gap-4' : 'flex gap-4'} mb-4`}>
                <select
                    value={filter}
                    onChange={(e) => handleAction(() => setFilter(e.target.value))}
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
                                <h3 className="text-lg text-gray-200">/{url.short_path}</h3>
                                <a 
                                    href={url.redirect_url} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="text-sm text-gray-400 hover:text-gray-300"
                                >
                                    {url.redirect_url}
                                </a>
                            </div>
                            <button
                                onClick={() => handleAction(() => handleToggleDeprecated(url))}
                                className={`px-3 py-1.5 rounded text-sm ${
                                    url.deprecated 
                                        ? 'bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20' 
                                        : 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
                                }`}
                            >
                                {url.deprecated ? 'Activate' : 'Deprecate'}
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <NoAccessDialog 
                isOpen={showNoAccess} 
                onClose={() => setShowNoAccess(false)} 
            />
        </div>
    );
}