import { useState, useEffect } from 'react';

export default function EditUrlDialog({ isOpen, onClose, url, onSubmit }) {
  const [redirectUrl, setRedirectUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && url) {
      setRedirectUrl(url.redirect_url);
      setError('');
    }
  }, [isOpen, url]);

  if (!isOpen) return null;

  const handleCancel = () => {
    setError('');
    setRedirectUrl(url.redirect_url);
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      await onSubmit({
        short_path: url.short_path,
        redirect_url: redirectUrl
      });
      onClose();
    } catch (error) {
      setError(error.message || 'Failed to update URL');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-[#0a0a0a] border border-gray-800 rounded-lg max-w-md w-full">
        <div className="border-b border-gray-800 p-4">
          <h3 className="text-lg font-semibold text-gray-200">
            Edit URL
          </h3>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Short Path
            </label>
            <div className="p-2 bg-[#1a1a1a] border border-gray-800 rounded text-gray-400">
              /{url?.short_path}
            </div>
          </div>

          <div>
            <label htmlFor="redirect_url" className="block text-sm text-gray-400 mb-1">
              URL
            </label>
            <input
              type="url"
              id="redirect_url"
              value={redirectUrl}
              onChange={(e) => setRedirectUrl(e.target.value)}
              required
              className="w-full p-2 bg-[#1a1a1a] border border-gray-800 rounded text-gray-200 placeholder-gray-500 focus:outline-none focus:border-gray-700"
              placeholder="https://example.com"
            />
          </div>

          {error && (
            <p className="text-red-500 text-sm">{error}</p>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 rounded text-sm bg-[#1a1a1a] text-gray-300 hover:bg-[#222] transition-colors border border-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded text-sm bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition-colors"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 