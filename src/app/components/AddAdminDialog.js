import AdminList from './AdminList';

export default function AddAdminDialog({ isOpen, onClose, onSubmit, error, admins, onRemove, currentUsername }) {
    if (!isOpen) return null;
  
    const handleSubmit = (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      onSubmit(formData.get('github_username'));
    };
  
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-[#0a0a0a] border border-gray-800 rounded-lg max-w-md w-full">
          <div className="border-b border-gray-800 p-4">
            <h3 className="text-lg font-semibold text-gray-200">
              Manage Admins
            </h3>
          </div>
  
          <div className="p-6 space-y-6">
            {/* Current Admins */}
            <AdminList 
              admins={admins} 
              onRemove={onRemove}
              currentUsername={currentUsername}
            />
  
            {/* Add New Admin Form */}
            <div>
              <h4 className="text-sm font-semibold text-gray-200 mb-4">Add New Admin</h4>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="github_username" className="block text-sm text-gray-400">
                    GitHub Username
                  </label>
                  <input
                    type="text"
                    id="github_username"
                    name="github_username"
                    required
                    className="w-full p-2 bg-[#1a1a1a] border border-gray-800 rounded text-gray-200 placeholder-gray-500 focus:outline-none focus:border-gray-700"
                    placeholder="username"
                  />
                </div>
  
                {error && (
                  <p className="text-red-500 text-sm">{error}</p>
                )}
  
                <button
                  type="submit"
                  className="w-full px-4 py-2 rounded text-sm bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition-colors"
                >
                  Add Admin
                </button>
              </form>
            </div>
          </div>
  
          <div className="border-t border-gray-800 p-4 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded text-sm bg-[#1a1a1a] text-gray-300 hover:bg-[#222] transition-colors border border-gray-800"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }