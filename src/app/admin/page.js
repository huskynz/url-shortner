'use client';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useState, useEffect } from 'react';

export default function AdminDashboard() {
  const { data: session, status } = useSession();
  const [urls, setUrls] = useState([]);
  const [error, setError] = useState(null);
  const [newUrl, setNewUrl] = useState({ short_path: '', redirect_url: '' });

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
  };

  const handleDelete = async (short_path) => {
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
  };

  if (status === 'loading') {
    return (
      <div className="p-8">
        <p>Status: {status}</p>
        <p>Loading authentication...</p>
      </div>
    );
  }
  
  if (!session) {
    return (
      <div className="p-8">
        <p>Status: {status}</p>
        <p>Not authenticated</p>
        <button 
          onClick={() => signIn('github')} 
          className="bg-blue-500 text-white px-4 py-2 rounded mt-4"
        >
          Sign in with GitHub
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <p>Status: {status}</p>
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">URL Admin Dashboard</h1>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            {session?.user?.image && (
              <img 
                src={session.user.image} 
                alt="Profile" 
                className="w-8 h-8 rounded-full"
              />
            )}
            <span className="text-gray-300">
              {session?.user?.name}
            </span>
          </div>
          <button 
            onClick={() => signOut()} 
            className="bg-red-500/10 text-red-500 px-4 py-2 rounded hover:bg-red-500/20"
          >
            Sign Out
          </button>
        </div>
      </div>
      
      <form onSubmit={handleAdd} className="mb-8">
        <div className="space-y-4">
          <input
            type="text"
            placeholder="Short Path"
            value={newUrl.short_path}
            onChange={(e) => setNewUrl({ ...newUrl, short_path: e.target.value })}
            className="w-full p-2 border rounded bg-gray-800 border-gray-700 text-white placeholder-gray-400"
            required
          />
          <input
            type="url"
            placeholder="Redirect URL"
            value={newUrl.redirect_url}
            onChange={(e) => setNewUrl({ ...newUrl, redirect_url: e.target.value })}
            className="w-full p-2 border rounded bg-gray-800 border-gray-700 text-white placeholder-gray-400"
            required
          />
          <button 
            type="submit" 
            className="bg-blue-500/10 text-blue-500 px-4 py-2 rounded hover:bg-blue-500/20"
          >
            Add URL
          </button>
        </div>
      </form>

      <div className="space-y-4">
        {urls.map((url) => (
          <div key={url.short_path} className="border border-gray-700 bg-gray-800/50 p-4 rounded flex justify-between items-center">
            <div>
              <p><strong>/{url.short_path}</strong> → {url.redirect_url}</p>
              <p className={url.deprecated ? 'text-red-500' : 'text-green-500'}>
                Status: {url.deprecated ? 'Deprecated' : 'Active'}
              </p>
            </div>
            <div className="space-x-2">
              <button
                onClick={() => handleToggleDeprecated(url.short_path, url.deprecated)}
                className={`px-3 py-1 rounded ${
                  url.deprecated 
                    ? 'bg-green-500/10 text-green-500 hover:bg-green-500/20' 
                    : 'bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20'
                }`}
              >
                {url.deprecated ? 'Activate' : 'Deprecate'}
              </button>
              <button
                onClick={() => handleDelete(url.short_path)}
                className="bg-red-500/10 text-red-500 px-3 py-1 rounded hover:bg-red-500/20"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
} 