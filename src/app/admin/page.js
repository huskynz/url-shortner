'use client';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { fetchUrls, addUrl, deleteUrl, toggleDeprecated } from '../actions/urlActions';

export default function AdminDashboard() {
  const { data: session, status } = useSession();
  const [urls, setUrls] = useState([]);
  const [newUrl, setNewUrl] = useState({ short_path: '', redirect_url: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUrls();
  }, []);

  const loadUrls = async () => {
    try {
      const data = await fetchUrls();
      setUrls(data || []);
    } catch (error) {
      console.error('Error loading URLs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await addUrl(newUrl.short_path, newUrl.redirect_url);
      setNewUrl({ short_path: '', redirect_url: '' });
      loadUrls();
    } catch (error) {
      console.error('Error adding URL:', error);
    }
  };

  const handleDelete = async (short_path) => {
    try {
      await deleteUrl(short_path);
      loadUrls();
    } catch (error) {
      console.error('Error deleting URL:', error);
    }
  };

  const handleToggleDeprecated = async (shortPath, currentState) => {
    try {
      await toggleDeprecated(shortPath, currentState);
      loadUrls();
    } catch (error) {
      console.error('Error toggling deprecated status:', error);
    }
  };

  if (status === 'loading' || loading) {
    return <div className="p-8">Loading...</div>;
  }

  if (status === 'unauthenticated') {
    return (
      <div className="p-8">
        <p className="mb-4">Access Denied</p>
        <button 
          onClick={() => signIn('github')} 
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Sign in with GitHub
        </button>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">URL Admin Dashboard</h1>
        <button 
          onClick={() => signOut()} 
          className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
        >
          Sign Out
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mb-8">
        <div className="space-y-4">
          <input
            type="text"
            placeholder="Short Path"
            value={newUrl.short_path}
            onChange={(e) => setNewUrl({ ...newUrl, short_path: e.target.value })}
            className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-700"
            required
          />
          <input
            type="url"
            placeholder="Redirect URL"
            value={newUrl.redirect_url}
            onChange={(e) => setNewUrl({ ...newUrl, redirect_url: e.target.value })}
            className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-700"
            required
          />
          <button 
            type="submit" 
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Add URL
          </button>
        </div>
      </form>

      <div className="space-y-4">
        {urls.map((url) => (
          <div 
            key={url.short_path} 
            className={`border p-4 rounded dark:border-gray-700 ${
              url.deprecated ? 'bg-red-500/10' : ''
            }`}
          >
            <div className="flex justify-between items-center">
              <div>
                <p><strong>Short Path:</strong> /{url.short_path}</p>
                <p><strong>Redirects to:</strong> {url.redirect_url}</p>
                <p><strong>Status:</strong> {url.deprecated ? 'Deprecated' : 'Active'}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleToggleDeprecated(url.short_path, url.deprecated)}
                  className={`px-3 py-1 rounded ${
                    url.deprecated 
                      ? 'bg-green-500 hover:bg-green-600' 
                      : 'bg-yellow-500 hover:bg-yellow-600'
                  } text-white`}
                >
                  {url.deprecated ? 'Activate' : 'Deprecate'}
                </button>
                <button
                  onClick={() => handleDelete(url.short_path)}
                  className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
} 