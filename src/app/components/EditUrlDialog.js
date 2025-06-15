'use client';
import { useState, useEffect } from 'react';
import { Cross2Icon, EyeOpenIcon, EyeClosedIcon } from '@radix-ui/react-icons';

export default function EditUrlDialog({ isOpen, onClose, url, onSave }) {
  const [formData, setFormData] = useState({
    short_path: '',
    redirect_url: '',
    private: false,
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (url) {
      setFormData({
        short_path: url.short_path,
        redirect_url: url.redirect_url,
        private: url.private || false,
        password: url.password || ''
      });
    }
  }, [url]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    onSave(formData);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-200">Edit URL</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <Cross2Icon className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">
                Short Path
              </label>
              <input
                type="text"
                value={formData.short_path}
                onChange={(e) => setFormData(prev => ({ ...prev, short_path: e.target.value }))}
                className="w-full p-2.5 bg-[#0a0a0a] border border-gray-800 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">
                Redirect URL
              </label>
              <input
                type="url"
                value={formData.redirect_url}
                onChange={(e) => setFormData(prev => ({ ...prev, redirect_url: e.target.value }))}
                className="w-full p-2.5 bg-[#0a0a0a] border border-gray-800 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                required
              />
            </div>
          </div>

          <div className="flex items-center space-x-3 pt-2">
            <input
              type="checkbox"
              id="private"
              checked={formData.private}
              onChange={(e) => {
                setFormData(prev => ({
                  ...prev,
                  private: e.target.checked,
                  password: e.target.checked ? prev.password : ''
                }));
              }}
              className="rounded border-gray-800 bg-[#0a0a0a] text-blue-500 focus:ring-blue-500"
            />
            <label htmlFor="private" className="text-sm font-medium text-gray-300">
              Password protect this URL
            </label>
          </div>

          {formData.private && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">
                Password
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full p-2.5 bg-[#0a0a0a] border border-gray-800 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(prev => !prev)}
                  className="p-2.5 hover:bg-gray-800 rounded-lg transition-colors text-gray-400"
                  title={showPassword ? "Hide Password" : "Show Password"}
                >
                  {showPassword ? <EyeOpenIcon className="h-5 w-5" /> : <EyeClosedIcon className="h-5 w-5" />}
                </button>
              </div>
            </div>
          )}

          {error && (
            <p className="text-red-500 text-sm font-medium">{error}</p>
          )}

          <div className="flex justify-end space-x-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg text-sm bg-[#0a0a0a] text-gray-300 hover:bg-[#111] transition-colors border border-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2.5 rounded-lg text-sm bg-blue-500 text-white hover:bg-blue-600 transition-colors"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 