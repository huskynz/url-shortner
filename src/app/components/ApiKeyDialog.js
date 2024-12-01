'use client';
import { useState, useEffect } from 'react';
import ConfirmDialog from './ConfirmDialog';
import EditKeyDialog from './EditKeyDialog';

export default function ApiKeyDialog({ isOpen, onClose }) {
  const [name, setName] = useState('');
  const [expiration, setExpiration] = useState('30d');
  const [customExpiration, setCustomExpiration] = useState('');
  const [expirationOption, setExpirationOption] = useState('duration');
  const [error, setError] = useState('');
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generatedKey, setGeneratedKey] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState(null);
  const [editingKey, setEditingKey] = useState(null);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [keyToDeactivate, setKeyToDeactivate] = useState(null);
  const [actionType, setActionType] = useState(null);

  const loadKeys = async () => {
    try {
      const res = await fetch('/api/admin-keys');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setKeys(data);
    } catch (error) {
      setError(error.message || 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadKeys();
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          expiration: expirationOption === 'never' ? null :
            expirationOption === 'custom' ? customExpiration :
              expiration
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setGeneratedKey(data.key);
      loadKeys();
      setName('');
    } catch (error) {
      setError(error.message || 'Failed to create API key');
    }
  };

  const handleClose = () => {
    if (generatedKey) {
      setShowConfirm(true);
    } else {
      handleFinalClose();
    }
  };

  const handleFinalClose = () => {
    setName('');
    setExpiration('30d');
    setCustomExpiration('');
    setExpirationOption('duration');
    setError('');
    setGeneratedKey('');
    setShowConfirm(false);
    setShowDeleteConfirm(false);
    setKeyToDelete(null);
    setEditingKey(null);
    onClose();
  };

  const handleCancelConfirm = () => {
    setShowConfirm(false);
  };

  const handleConfirmClose = () => {
    handleFinalClose();
  };

  const handleDeleteClick = (key) => {
    setKeyToDelete(key);
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!keyToDelete) return;

    try {
      const res = await fetch('/api/admin-keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: keyToDelete.id }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      loadKeys();
    } catch (error) {
      setError(error.message || 'Failed to delete API key');
    } finally {
      setShowDeleteConfirm(false);
      setKeyToDelete(null);
    }
  };

  const handleCancelDelete = () => {
    setShowDeleteConfirm(false);
    setKeyToDelete(null);
  };

  const handleEdit = (key) => {
    setEditingKey(key);
  };

  const handleStatusClick = (key) => {
    setKeyToDeactivate(key);
    setActionType(key.is_active ? 'deactivate' : 'activate');
    setShowDeactivateConfirm(true);
  };

  const handleDeactivateConfirm = async () => {
    if (!keyToDeactivate) return;

    try {
      const res = await fetch('/api/admin-keys', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: keyToDeactivate.id }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      loadKeys();
    } catch (error) {
      setError(error.message || 'Failed to deactivate API key');
    } finally {
      setShowDeactivateConfirm(false);
      setKeyToDeactivate(null);
      setActionType(null);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-[#0a0a0a] border border-gray-800 rounded-lg max-w-2xl w-full">
          <div className="border-b border-gray-800 p-4 flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-200">API Keys</h3>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-300"
            >
              ×
            </button>
          </div>

          <div className="p-6 space-y-6">
            {error && (
              <div className="text-red-500 text-sm">{error}</div>
            )}

            {generatedKey && (
              <div className="bg-green-500/10 border border-green-500/20 rounded p-4">
                <p className="text-green-500 text-sm font-medium">New API Key Generated</p>
                <p className="mt-2 font-mono text-sm break-all">{generatedKey}</p>
                <p className="mt-2 text-xs text-green-500/80">
                  Make sure to copy this key now. You won't be able to see it again!
                </p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 block w-full rounded bg-[#1a1a1a] border border-gray-800 px-3 py-2"
                  required
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

              <button
                type="submit"
                className="w-full px-4 py-2 rounded text-sm bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
              >
                Create New Key
              </button>
            </form>

            <div className="space-y-3">
              {loading ? (
                <p className="text-gray-400 text-sm">Loading keys...</p>
              ) : (
                keys.map((key) => (
                  <div
                    key={key.id}
                    className="flex items-center justify-between p-3 bg-[#1a1a1a] rounded border border-gray-800"
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={`https://github.com/${key.created_by}.png`}
                        alt={key.created_by}
                        className="w-8 h-8 rounded-full"
                      />
                      <div>
                        <p className="text-gray-300">{key.name}</p>
                        <p className="text-xs text-gray-500">
                          Created by: {key.created_by}
                          <span className="mx-1">•</span>
                          {new Date(key.created_at).toLocaleDateString()}
                          {key.expires_at && (
                            <>
                              <span className="mx-1">•</span>
                              Expires: {new Date(key.expires_at).toLocaleDateString()}
                            </>
                          )}
                          <span className="mx-1">•</span>
                          Status: <span className={key.is_active ? "text-green-500" : "text-red-500"}>
                            {key.is_active ? "Active" : "Inactive"}
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleEdit(key)}
                        className="px-3 py-1 rounded text-xs bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleStatusClick(key)}
                        className={`px-3 py-1 rounded text-xs ${
                          key.is_active 
                            ? "bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20" 
                            : "bg-green-500/10 text-green-500 hover:bg-green-500/20"
                        }`}
                      >
                        {key.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => handleDeleteClick(key)}
                        className="px-3 py-1 rounded text-xs bg-red-500/10 text-red-500 hover:bg-red-500/20"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="border-t border-gray-800 p-4 flex justify-end">
            <button
              onClick={handleClose}
              className="px-4 py-2 rounded text-sm bg-[#1a1a1a] text-gray-300 hover:bg-[#222] border border-gray-800"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        visible={showConfirm}
        onClose={handleCancelConfirm}
        onConfirm={handleConfirmClose}
        title="Close API Key Dialog"
        message="Make sure you have copied your API key. You won't be able to see it again! Close anyway?"
        variant="warning"
      />

      <ConfirmDialog
        visible={showDeleteConfirm}
        onClose={handleCancelDelete}
        onConfirm={handleDeleteConfirm}
        title="Delete API Key"
        message="Are you sure you want to delete this API key? This action cannot be undone."
        variant="danger"
      />

      <ConfirmDialog
        visible={showDeactivateConfirm}
        onClose={() => {
          setShowDeactivateConfirm(false);
          setKeyToDeactivate(null);
          setActionType(null);
        }}
        onConfirm={handleDeactivateConfirm}
        title={`${actionType === 'activate' ? 'Activate' : 'Deactivate'} API Key`}
        message={
          actionType === 'activate'
            ? "Are you sure you want to activate this API key? The key will be able to make API calls again."
            : "Are you sure you want to deactivate this API key? The key will no longer work but can be reactivated later."
        }
        variant={actionType === 'activate' ? "success" : "warning"}
      />

      <EditKeyDialog
        isOpen={!!editingKey}
        onClose={() => setEditingKey(null)}
        keyData={editingKey}
        onUpdate={() => {
          loadKeys();
          setEditingKey(null);
        }}
      />
    </>
  );
} 