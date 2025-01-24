'use client';
import { useState, useEffect } from 'react';
import LoadingSpinner from './LoadingSpinner';

export default function ApiKeyDialog({ isOpen, onClose }) {
  const [name, setName] = useState('');
  const [expiration, setExpiration] = useState('30d');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [newKey, setNewKey] = useState(null);
  const [keys, setKeys] = useState([]);

  const loadKeys = async () => {
    try {
      const res = await fetch('/api/admin-keys', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!res.ok) {
        throw new Error('Failed to load keys');
      }
      
      const data = await res.json();
      setKeys(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading keys:', error);
      setError('Failed to load API keys');
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadKeys();
    }
  }, [isOpen]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const res = await fetch('/api/admin-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, expiration }),
      });
      
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      setNewKey(data.key);
      loadKeys();
      setName('');
    } catch (error) {
      setError(error.message || 'Failed to create API key');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-[#0a0a0a] border border-gray-800 rounded-lg max-w-2xl w-full">
        <div className="border-b border-gray-800 p-4">
          <h3 className="text-lg font-semibold text-gray-200">Manage API Keys</h3>
        </div>

        <div className="p-6 space-y-6">
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm text-gray-400 mb-1">Key Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full p-2 bg-[#1a1a1a] border border-gray-800 rounded text-gray-200"
                  placeholder="Enter key name"
                />
              </div>
              <div className="w-1/3">
                <label className="block text-sm text-gray-400 mb-1">Expiration</label>
                <select
                  value={expiration}
                  onChange={(e) => setExpiration(e.target.value)}
                  className="w-full p-2 bg-[#1a1a1a] border border-gray-800 rounded text-gray-200"
                >
                  <option value="30d">30 days</option>
                  <option value="90d">90 days</option>
                  <option value="365d">1 year</option>
                  <option value="never">Never</option>
                </select>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2 rounded text-sm bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
            >
              {loading ? <LoadingSpinner /> : 'Create New API Key'}
            </button>
          </form>

          {error && (
            <div className="text-red-500 text-sm">{error}</div>
          )}

          {newKey && (
            <div className="p-4 bg-green-500/10 border border-green-500/20 rounded">
              <p className="text-green-500 text-sm mb-2">New API Key Created:</p>
              <code className="block p-2 bg-black rounded text-sm text-gray-300 break-all">{newKey}</code>
              <p className="text-xs text-gray-400 mt-2">Make sure to copy this key now. You won't be able to see it again!</p>
            </div>
          )}

          <div className="space-y-4">
            <h4 className="text-md font-semibold text-gray-300">Active API Keys</h4>
            <div className="space-y-2">
              {keys.map((key) => (
                <div key={key.id} className="flex items-center justify-between p-3 border border-gray-800 rounded">
                  <div>
                    <p className="text-gray-300">{key.name}</p>
                    <p className="text-xs text-gray-500">
                      Created: {new Date(key.created_at).toLocaleDateString()}
                      {key.expires_at && ` · Expires: ${new Date(key.expires_at).toLocaleDateString()}`}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRevoke(key.id)}
                    className="px-3 py-1.5 rounded text-sm bg-red-500/10 text-red-500 hover:bg-red-500/20"
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-gray-800 p-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded text-sm bg-[#1a1a1a] text-gray-300 hover:bg-[#222] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}