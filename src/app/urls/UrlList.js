'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
    MagnifyingGlassIcon, 
    Cross2Icon, 
    CopyIcon, 
    CheckIcon,
    GlobeIcon,
    ClockIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    ExternalLinkIcon,
    Link2Icon,
    StarIcon,
    StarFilledIcon,
    MixerHorizontalIcon,
    GridIcon,
    ListBulletIcon,
} from '@radix-ui/react-icons';
import { useDeviceDetect } from '../hooks/useDeviceDetect';
import { useRole } from '../hooks/useRole';
import NoAccessDialog from '../components/NoAccessDialog';
import { useSession, signIn } from 'next-auth/react';

export default function UrlList({ initialUrls }) {
    const [urls, setUrls] = useState(initialUrls);
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [showNoAccess, setShowNoAccess] = useState(false);
    const [copiedUrl, setCopiedUrl] = useState(null);
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const [expandedUrl, setExpandedUrl] = useState(null);
    const [sortConfig, setSortConfig] = useState({ key: 'short_path', direction: 'asc' });
    const [viewMode, setViewMode] = useState('grid');
    const [showFilters, setShowFilters] = useState(false);
    const [favorites, setFavorites] = useState(() => {
        if (typeof window !== 'undefined') {
            const savedFavorites = localStorage.getItem('urlFavorites');
            return savedFavorites ? new Set(JSON.parse(savedFavorites)) : new Set();
        }
        return new Set();
    });
    const isMobileView = useDeviceDetect();
    const { isAdmin, isOwner } = useRole();

    const clearSearch = useCallback(() => {
        setSearch('');
        document.getElementById('url-search')?.focus();
    }, []);

    const toggleExpand = useCallback((shortPath) => {
        setExpandedUrl(current => {
            if (current === shortPath) {
                return null;
            }
            return shortPath;
        });
    }, []);

    const toggleFavorite = useCallback((shortPath) => {
        setFavorites(prev => {
            const newFavorites = new Set(prev);
            if (newFavorites.has(shortPath)) {
                newFavorites.delete(shortPath);
            } else {
                newFavorites.add(shortPath);
            }
            return newFavorites;
        });
    }, [setFavorites]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyPress = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                document.getElementById('url-search')?.focus();
            }
            if (e.key === 'Escape' && document.activeElement.id === 'url-search') {
                setSearch('');
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
                e.preventDefault();
                setViewMode(current => current === 'grid' ? 'list' : 'grid');
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                if (expandedUrl) {
                    e.preventDefault();
                    toggleFavorite(expandedUrl);
                }
            }
        };

        window.addEventListener('keydown', handleKeyPress);
        return () => window.removeEventListener('keydown', handleKeyPress);
    }, [expandedUrl, toggleFavorite, setViewMode, setSearch]);

    // Persist favorites to local storage whenever they change
    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('urlFavorites', JSON.stringify(Array.from(favorites)));
        }
    }, [favorites]);

    const handleAction = (action) => {
        if (!isAdmin && !isOwner) {
            setShowNoAccess(true);
            return;
        }
        action();
    };

    const handleCopyUrl = async (shortPath) => {
        const fullUrl = `${window.location.origin}/${shortPath}`;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(fullUrl);
        } else {
            // Fallback for browsers that do not support navigator.clipboard
            const textArea = document.createElement('textarea');
            textArea.value = fullUrl;
            textArea.style.position = 'fixed';  // Prevent scrolling to bottom of page in iOS.
            textArea.style.left = '-9999px';
            textArea.style.top = '-9999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try {
                document.execCommand('copy');
            } catch (err) {
                console.error('Fallback: Oops, unable to copy', err);
            }
            document.body.removeChild(textArea);
        }
        setCopiedUrl(shortPath);
        setTimeout(() => setCopiedUrl(null), 2000);
    };

    const handleSort = (key) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const stats = useMemo(() => ({
        total: urls.length,
        active: urls.filter(url => !url.deprecated).length,
        deprecated: urls.filter(url => url.deprecated).length,
        favorites: favorites.size
    }), [urls, favorites]);

    const filteredUrls = useMemo(() => 
        urls
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
            })
            .sort((a, b) => {
                const aValue = a[sortConfig.key];
                const bValue = b[sortConfig.key];
                const modifier = sortConfig.direction === 'asc' ? 1 : -1;

                if (sortConfig.key === 'favorites') {
                    const aIsFavorite = favorites.has(a.short_path);
                    const bIsFavorite = favorites.has(b.short_path);

                    if (aIsFavorite && !bIsFavorite) return -1 * modifier;
                    if (!aIsFavorite && bIsFavorite) return 1 * modifier;
                    
                    // If both are favorites or both are not, sort by short_path as a secondary sort
                    return a.short_path.localeCompare(b.short_path) * modifier;
                }

                if (typeof aValue === 'string') {
                    return aValue.localeCompare(bValue) * modifier;
                }
                return (aValue - bValue) * modifier;
            }), [urls, sortConfig, filter, search, favorites]);

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-gray-200 font-sans flex flex-col">
            {/* Header */}
            <header className="sticky top-0 z-50 border-b border-gray-800 bg-[#0f0f0f]/95 backdrop-blur-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <img 
                                src={process.env.NEXT_PUBLIC_LOGO_URL} 
                                width={40} 
                                height={40} 
                                alt="Logo"
                                className="rounded"
                            />
                            <div>
                                <h1 className="text-xl font-bold">HuskyNZ URL Shortner</h1>
                                <p className="text-sm text-gray-400">
                                    Version {process.env.NEXT_PUBLIC_Version_Number} | 
                                    <span className={`ml-1 ${process.env.NEXT_PUBLIC_ENV === "Development" ? "text-red-500" : "text-green-400"}`}>
                                        {process.env.NEXT_PUBLIC_ENV}
                                    </span>
                                </p>
                            </div>
                        </div>
                        
                        <button 
                            onClick={() => signIn(undefined, { callbackUrl: '/admin/dashboard' })} 
                            className="bg-green-500/10 text-green-500 px-4 py-2 rounded hover:bg-green-500/20 text-sm transition-colors"
                        >
                            Sign In
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-grow">
                {/* Stats Overview */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <div className="bg-[#0f0f0f] border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors duration-150 ease-in-out">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-500/10 rounded-lg">
                                <Link2Icon className="w-5 h-5 text-blue-500" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-400">Total URLs</p>
                                <p className="text-2xl font-semibold">{stats.total}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-[#0f0f0f] border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors duration-150 ease-in-out">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-green-500/10 rounded-lg">
                                <GlobeIcon className="w-5 h-5 text-green-500" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-400">Active URLs</p>
                                <p className="text-2xl font-semibold">{stats.active}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-[#0f0f0f] border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors duration-150 ease-in-out">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-yellow-500/10 rounded-lg">
                                <ClockIcon className="w-5 h-5 text-yellow-500" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-400">Deprecated URLs</p>
                                <p className="text-2xl font-semibold">{stats.deprecated}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-[#0f0f0f] border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors duration-150 ease-in-out">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-500/10 rounded-lg">
                                <StarFilledIcon className="w-5 h-5 text-purple-500" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-400">Favorites</p>
                                <p className="text-2xl font-semibold">{stats.favorites}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Controls */}
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                    <div className="relative flex-1">
                        <div className="relative">
                            <input
                                id="url-search"
                                type="text"
                                placeholder="Search URLs... (Ctrl/Cmd + K)"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onFocus={() => setIsSearchFocused(true)}
                                onBlur={() => setIsSearchFocused(false)}
                                className="w-full p-2 pl-10 pr-10 border rounded bg-[#0f0f0f] border-gray-800 text-gray-300 placeholder-gray-400 focus:outline-none focus:border-gray-700 transition-colors"
                            />
                            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            {search && (
                                <button
                                    onClick={clearSearch}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-800/50 transition-colors"
                                    title="Clear search"
                                >
                                    <Cross2Icon className="w-4 h-4 text-gray-400" />
                                </button>
                            )}
                        </div>
                        {isSearchFocused && (
                            <div className="absolute top-full left-0 right-0 mt-1 p-2 bg-[#0f0f0f] rounded border border-gray-800 text-xs text-gray-400 shadow-lg">
                                <div className="flex items-center justify-between">
                                    <span>Press <kbd className="px-1 py-0.5 bg-gray-800 rounded">Ctrl</kbd> + <kbd className="px-1 py-0.5 bg-gray-800 rounded">K</kbd> to focus search</span>
                                    <span>Press <kbd className="px-1 py-0.5 bg-gray-800 rounded">Ctrl</kbd> + <kbd className="px-1 py-0.5 bg-gray-800 rounded">V</kbd> to toggle view | <kbd className="px-1 py-0.5 bg-gray-800 rounded">Ctrl</kbd> + <kbd className="px-1 py-0.5 bg-gray-800 rounded">F</kbd> to toggle favorite</span>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className="p-2 rounded bg-[#0f0f0f] border border-gray-800 text-gray-300 hover:bg-gray-800/50 transition-colors duration-150 ease-in-out"
                            title="Toggle filters"
                        >
                            <MixerHorizontalIcon className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                            className="p-2 rounded bg-[#0f0f0f] border border-gray-800 text-gray-300 hover:bg-gray-800/50 transition-colors duration-150 ease-in-out"
                            title={`Switch to ${viewMode === 'grid' ? 'list' : 'grid'} view`}
                        >
                            {viewMode === 'grid' ? <ListBulletIcon className="w-4 h-4" /> : <GridIcon className="w-4 h-4" />}
                        </button>
                    </div>
                </div>

                {/* Advanced Filters */}
                {showFilters && (
                    <div className="mb-6 bg-[#0f0f0f] border border-gray-800 rounded-lg p-4 transition-all duration-300 ease-in-out">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Filter By</label>
                                <select
                                    value={filter}
                                    onChange={(e) => setFilter(e.target.value)}
                                    className="w-full p-2 rounded bg-[#0f0f0f] border border-gray-800 text-gray-300 focus:outline-none focus:border-gray-700 transition-colors"
                                >
                                    <option value="all">All URLs</option>
                                    <option value="active">Active URLs</option>
                                    <option value="deprecated">Deprecated URLs</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Sort By</label>
                                <select
                                    value={sortConfig.key}
                                    onChange={(e) => handleSort(e.target.value)}
                                    className="w-full p-2 rounded bg-[#0f0f0f] border border-gray-800 text-gray-300 focus:outline-none focus:border-gray-700 transition-colors"
                                >
                                    <option value="short_path">Short Path</option>
                                    <option value="redirect_url">Redirect URL</option>
                                    <option value="favorites">Favorites</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Sort Direction</label>
                                <button
                                    onClick={() => setSortConfig(prev => ({ ...prev, direction: prev.direction === 'asc' ? 'desc' : 'asc' }))}
                                    className="w-full p-2 rounded bg-[#0f0f0f] border border-gray-800 text-gray-300 hover:bg-gray-800/50 transition-colors duration-150 ease-in-out flex items-center justify-center gap-2"
                                >
                                    {sortConfig.direction === 'asc' ? (
                                        <>
                                            <ChevronUpIcon className="w-4 h-4" />
                                            <span>Ascending</span>
                                        </>
                                    ) : (
                                        <>
                                            <ChevronDownIcon className="w-4 h-4" />
                                            <span>Descending</span>
                                        </>
                                    )}
                                </button>
                            </div>
                            <div className="sm:col-span-2 lg:col-span-1">
                                <label className="block text-sm text-gray-400 mb-2 invisible">Clear Favorites</label>
                                <button
                                    onClick={() => {
                                        if (window.confirm('Are you sure you want to clear all favorites?')) {
                                            setFavorites(new Set());
                                        }
                                    }}
                                    className="w-full p-2 rounded bg-red-500/10 text-red-500 border border-red-500/50 hover:bg-red-500/20 transition-colors duration-150 ease-in-out flex items-center justify-center gap-2"
                                >
                                    <Cross2Icon className="w-4 h-4" />
                                    <span>Clear All Favorites</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* URL List */}
                {filteredUrls.length === 0 ? (
                    <div className="text-center py-12 bg-[#0f0f0f] border border-gray-800 rounded-lg">
                        <p className="text-lg text-gray-300">No URLs found</p>
                        <p className="text-sm text-gray-400 mt-2">Try adjusting your search or filter</p>
                    </div>
                ) : (
                    <div className={`grid gap-4 ${viewMode === 'grid' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 items-start' : ''}`}>
                        {filteredUrls.map((url) => {
                            const isExpanded = expandedUrl === url.short_path;
                            return (
                                <div
                                    key={url.short_path}
                                    className="group bg-[#0f0f0f] border border-gray-800 rounded-lg overflow-hidden transition-all duration-300 ease-in-out hover:border-gray-700 hover:shadow-lg hover:shadow-gray-900/20"
                                >
                                    <div className="p-4">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <h3 className="text-lg text-gray-200 truncate group-hover:text-white transition-colors">
                                                        /{url.short_path}
                                                    </h3>
                                                    <span className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${
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
                                                    className="text-sm text-gray-400 hover:text-gray-300 truncate block transition-colors"
                                                    title={url.redirect_url}
                                                >
                                                    {url.redirect_url}
                                                </a>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => toggleFavorite(url.short_path)}
                                                    className="p-1 rounded text-gray-400 hover:text-yellow-500 hover:bg-gray-800/50 transition-colors"
                                                    title={favorites.has(url.short_path) ? "Remove from favorites" : "Add to favorites"}
                                                >
                                                    {favorites.has(url.short_path) ? (
                                                        <StarFilledIcon className="w-4 h-4 text-yellow-500" />
                                                    ) : (
                                                        <StarIcon className="w-4 h-4" />
                                                    )}
                                                </button>
                                                <button
                                                    onClick={() => toggleExpand(url.short_path)}
                                                    className="p-1 rounded text-gray-400 hover:text-gray-300 hover:bg-gray-800/50 transition-colors"
                                                >
                                                    {isExpanded ? (
                                                        <ChevronUpIcon className="w-4 h-4" />
                                                    ) : (
                                                        <ChevronDownIcon className="w-4 h-4" />
                                                    )}
                                                </button>
                                            </div>
                                        </div>

                                        <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                                            <div className="overflow-hidden">
                                                <div className="mt-4 pt-4 border-t border-gray-800">
                                                    <div className="flex flex-wrap items-center gap-4">
                                                        <button
                                                            onClick={() => handleCopyUrl(url.short_path)}
                                                            className="flex items-center gap-2 px-3 py-1.5 rounded text-sm bg-gray-800/50 text-gray-300 hover:bg-gray-800 transition-colors"
                                                        >
                                                            {copiedUrl === url.short_path ? (
                                                                <>
                                                                    <CheckIcon className="w-4 h-4 text-green-500" />
                                                                    <span>Copied!</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <CopyIcon className="w-4 h-4" />
                                                                    <span>Copy URL</span>
                                                                </>
                                                            )}
                                                        </button>
                                                        <a
                                                            href={`/${url.short_path}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex items-center gap-2 px-3 py-1.5 rounded text-sm bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition-colors"
                                                        >
                                                            <ExternalLinkIcon className="w-4 h-4" />
                                                            <span>Visit</span>
                                                        </a>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>

            <NoAccessDialog 
                isOpen={showNoAccess} 
                onClose={() => setShowNoAccess(false)} 
            />

            {/* Footer */}
            <footer className="mt-12 border-t border-gray-800 bg-[#0f0f0f] py-4">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center text-gray-400">
                        <p>© 2025 HuskyNZ. Licensed under the MIT open source lisense <a className='text-white underline hover:text-gray-300 transition-colors' href='https://raw.githubusercontent.com/huskynz/url-shortner/refs/heads/master/LICENSE'>here</a> | You can view this site&apos;s source code <a href='/ghm' className='text-white underline hover:text-gray-300 transition-colors'>here</a></p>
                        <p className="mt-2">By using this site you agree to HuskyNZ&apos;s <a href='https://legal.husky.nz/toc' className='text-white underline hover:text-gray-300 transition-colors'>Terms of use</a> and <a href='https://legal.husky.nz/Privacy-Policy' className='text-white underline hover:text-gray-300 transition-colors'>Privacy policy</a></p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
