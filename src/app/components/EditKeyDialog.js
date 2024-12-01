'use client';
import { useState } from 'react';

export default function EditKeyDialog({ isOpen, onClose, keyData, onUpdate }) {
  const [newName, setNewName] = useState(keyData?.name || '');
  const [expiration, setExpiration] = useState('30d');
  const [customExpiration, setCustomExpiration] = useState('');
  const [expirationOption, setExpirationOption] = useState(
    keyData?.expires_at ? 'custom' : 'never'
  );
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin-keys', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: keyData.id,
          name: newName,
          expiration: expirationOption === 'never' ? null : 
                     expirationOption === 'custom' ? customExpiration : 
                     expiration
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      onUpdate();
      onClose();
    } catch (error) {
      setError(error.message || 'Failed to update API key');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
      <div className="bg-[#0a0a0a] border border-gray-800 rounded-lg max-w-md w-full">
        <div className="border-b border-gray-800 p-4">
          <h3 className="text-lg font-semibold text-gray-200">
            Edit API Key
          </h3>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="text-red-500 text-sm">{error}</div>
          )}

          <div className="space-y-4">
            {/* Current name (read-only) */}
            <div>
              <label className="block text-sm font-medium text-gray-300">Current Name</label>
              <input
                type="text"
                value={keyData?.name || ''}
                className="mt-1 block w-full rounded bg-[#1a1a1a] border border-gray-800 px-3 py-2 text-gray-400"
                disabled
              />
            </div>

            {/* New name input */}
            <div>
              <label className="block text-sm font-medium text-gray-300">New Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="mt-1 block w-full rounded bg-[#1a1a1a] border border-gray-800 px-3 py-2"
                required
                placeholder="Enter new name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300">Expiration</label>
              <select
                value={expirationOption}
                onChange={(e) => setExpirationOption(e.target.value)}
                className="mt-1 block w-full rounded bg-[#1a1a1a] border border-gray-800 px-3 py-2"
              >
                <option value="duration">Duration</option>
                <option value="custom">Custom Date</option>
                <option value="never">Never Expires</option>
              </select>

              {expirationOption === 'duration' && (
                <select
                  value={expiration}
                  onChange={(e) => setExpiration(e.target.value)}
                  className="mt-2 block w-full rounded bg-[#1a1a1a] border border-gray-800 px-3 py-2"
                >
                  <option value="1h">1 Hour</option>
                  <option value="24h">24 Hours</option>
                  <option value="7d">7 Days</option>
                  <option value="30d">30 Days</option>
                  <option value="90d">90 Days</option>
                  <option value="1y">1 Year</option>
                </select>
              )}

              {expirationOption === 'custom' && (
                <input
                  type="datetime-local"
                  value={customExpiration}
                  onChange={(e) => setCustomExpiration(e.target.value)}
                  className="mt-2 block w-full rounded bg-[#1a1a1a] border border-gray-800 px-3 py-2"
                  min={new Date().toISOString().slice(0, 16)}
                />
              )}
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded text-sm bg-[#1a1a1a] text-gray-300 hover:bg-[#222] border border-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded text-sm bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
            >
              Update Key
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 