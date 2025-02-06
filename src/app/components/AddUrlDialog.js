export default function AddUrlDialog({ isOpen, onClose, onSubmit, error }) {
  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    onSubmit({
      short_path: formData.get('short_path'),
      redirect_url: formData.get('redirect_url')
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-[#0a0a0a] border border-gray-800 rounded-lg max-w-md w-full">
        <div className="border-b border-gray-800 p-4">
          <h3 className="text-lg font-semibold text-gray-200">
            Add New URL
          </h3>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            <div className="space-y-2">
              <label htmlFor="short_path" className="block text-sm text-gray-400">
                Short Path
              </label>
              <input
                type="text"
                id="short_path"
                name="short_path"
                required
                className="w-full p-2 bg-[#1a1a1a] border border-gray-800 rounded text-gray-200 placeholder-gray-500 focus:outline-none focus:border-gray-700"
                placeholder="(example) logo"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="redirect_url" className="block text-sm text-gray-400">
                Redirect URL
              </label>
              <input
                type="url"
                id="redirect_url"
                name="redirect_url"
                required
                className="w-full p-2 bg-[#1a1a1a] border border-gray-800 rounded text-gray-200 placeholder-gray-500 focus:outline-none focus:border-gray-700"
                placeholder="(example) https://serv.husky.nz/logo/default.png"
              />
            </div>

            {error && (
              <p className="text-red-500 text-sm">{error}</p>
            )}
          </div>

          <div className="border-t border-gray-800 p-4 flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded text-sm bg-[#1a1a1a] text-gray-300 hover:bg-[#222] transition-colors border border-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded text-sm bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition-colors"
            >
              Add URL
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 