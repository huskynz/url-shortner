'use client';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { MobileIcon, DesktopIcon } from '@radix-ui/react-icons';
import { useDeviceDetect } from '../hooks/useDeviceDetect';
import ConfirmDialog from '../components/ConfirmDialog';
import AddUrlDialog from '../components/AddUrlDialog';

export default function AdminDashboard() {
  const { data: session, status } = useSession();
  const [urls, setUrls] = useState([]);
  const [error, setError] = useState(null);
  const [newUrl, setNewUrl] = useState({ short_path: '', redirect_url: '' });
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const isMobileDevice = useDeviceDetect();
  const [isMobileView, setIsMobileView] = useState(true);
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: '',
    variant: '',
    onConfirm: () => {},
  });
  const [isAddUrlOpen, setIsAddUrlOpen] = useState(false);

  useEffect(() => {
    setIsMobileView(isMobileDevice);
  }, [isMobileDevice]);

  const loadUrls = async () => {
    try {
      const res = await fetch('/api/admin-urls');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setUrls(data);
    } catch (err) {
      setError('Failed to load URLs');
    }
  };

  useEffect(() => {
    if (session) loadUrls();
  }, [session]);

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin-urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUrl),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setNewUrl({ short_path: '', redirect_url: '' });
      loadUrls();
    } catch (err) {
      setError('Failed to add URL');
    }
  };

  const handleToggleDeprecated = async (short_path, currentState) => {
    const action = currentState ? 'activate' : 'deprecate';
    setConfirmDialog({
      isOpen: true,
      title: `${action.charAt(0).toUpperCase() + action.slice(1)} URL`,
      message: `Are you sure you want to ${action} /${short_path}?`,
      confirmText: action.charAt(0).toUpperCase() + action.slice(1),
      variant: currentState ? 'yellow' : 'green',
      onConfirm: async () => {
        try {
          const res = await fetch('/api/admin-urls', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ short_path, deprecated: !currentState }),
          });
          const data = await res.json();
          if (data.error) throw new Error(data.error);
          loadUrls();
        } catch (err) {
          setError('Failed to update URL');
        }
      },
    });
  };

  const handleDelete = async (short_path) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete URL',
      message: `Are you sure you want to delete /${short_path}? This action cannot be undone.`,
      confirmText: 'Delete',
      variant: 'red',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/admin-urls?short_path=${short_path}`, {
            method: 'DELETE',
          });
          const data = await res.json();
          if (data.error) throw new Error(data.error);
          loadUrls();
        } catch (err) {
          setError('Failed to delete URL');
        }
      },
    });
  };

  const handleAddUrl = async (newUrl) => {
    try {
      const res = await fetch('/api/admin-urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUrl),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      loadUrls();
      setIsAddUrlOpen(false);
      setError('');
    } catch (err) {
      setError('Failed to add URL');
    }
  };

  if (status === 'loading') {
    return <div className="p-8">Loading...</div>;
  }

  if (!session) {
    return (
      <div className="p-8">
        <button 
          onClick={() => signIn('github')} 
          className="bg-blue-500/10 text-blue-500 px-4 py-2 rounded hover:bg-blue-500/20"
        >
          Sign in with GitHub
        </button>
      </div>
    );
  }

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
    <>
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
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          </div>

          <div className={`${isMobileView ? 'flex flex-col items-center mt-4' : 'flex items-center'} gap-4`}>
            {isMobileView ? (
              // Mobile Layout
              <>
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-3">
                    {session?.user?.image && (
                      <img src={session.user.image} alt="Profile" className="w-8 h-8 rounded-full" />
                    )}
                    <span className="text-gray-300">{session?.user?.name}</span>
                  </div>
                  <button 
                    onClick={() => signOut()} 
                    className="bg-red-500/10 text-red-500 px-4 py-2 rounded hover:bg-red-500/20 text-sm"
                  >
                    Sign Out
                  </button>
                </div>
                <button
                  onClick={() => setIsMobileView(!isMobileView)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded bg-gray-800 text-gray-300 hover:bg-gray-700 text-sm"
                >
                  <MobileIcon className="w-4 h-4" />
                  Mobile View
                </button>
                <button
                  onClick={() => setIsAddUrlOpen(true)}
                  className="px-4 py-2 rounded text-sm bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition-colors"
                >
                  Add URL
                </button>
              </>
            ) : (
              // Desktop Layout - Updated
              <>
                <button
                  onClick={() => setIsAddUrlOpen(true)}
                  className="px-4 py-2 rounded text-sm bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition-colors"
                >
                  Add URL
                </button>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => signOut()} 
                    className="bg-red-500/10 text-red-500 px-4 py-2 rounded hover:bg-red-500/20 text-sm"
                  >
                    Sign Out
                  </button>
                  {session?.user?.image && (
                    <img src={session.user.image} alt="Profile" className="w-8 h-8 rounded-full" />
                  )}
                  <span className="text-gray-300">{session?.user?.name}</span>
                </div>
              </>
            )}
          </div>
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
          {filteredUrls.map((url) => (
            <div 
              key={url.short_path} 
              className="border border-gray-700 p-4 rounded-lg transition-all duration-200 hover:border-gray-600"
            >
              {isMobileView ? (
                // Mobile Layout
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="font-mono text-sm break-all">/{url.short_path}</p>
                    <p className="text-gray-400 text-sm break-all">
                      Redirects to: <a href={url.redirect_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                        {url.redirect_url}
                      </a>
                    </p>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      url.deprecated 
                        ? 'bg-red-500/10 text-red-500' 
                        : 'bg-green-500/10 text-green-500'
                    }`}>
                      {url.deprecated ? 'Deprecated' : 'Active'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => handleToggleDeprecated(url.short_path, url.deprecated)}
                      className={`w-full py-2 rounded text-center ${
                        url.deprecated 
                          ? 'bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20' 
                          : 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
                      }`}
                    >
                      {url.deprecated ? 'Activate' : 'Deprecate'}
                    </button>
                    <button
                      onClick={() => handleDelete(url.short_path)}
                      className="w-full py-2 rounded text-center bg-red-500/10 text-red-500 hover:bg-red-500/20"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ) : (
                // Desktop Layout
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
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleDeprecated(url.short_path, url.deprecated)}
                      className={`px-3 py-1.5 text-sm rounded whitespace-nowrap ${
                        url.deprecated 
                          ? 'bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20' 
                          : 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
                      }`}
                    >
                      {url.deprecated ? 'Activate' : 'Deprecate'}
                    </button>
                    <button
                      onClick={() => handleDelete(url.short_path)}
                      className="px-3 py-1.5 text-sm rounded whitespace-nowrap bg-red-500/10 text-red-500 hover:bg-red-500/20"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        variant={confirmDialog.variant}
      />

      <AddUrlDialog
        isOpen={isAddUrlOpen}
        onClose={() => {
          setIsAddUrlOpen(false);
          setError('');
        }}
        onSubmit={handleAddUrl}
        error={error}
      />
    </>
  );
} 