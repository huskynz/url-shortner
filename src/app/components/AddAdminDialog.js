import AdminList from './AdminList';

export default function AddAdminDialog({ isOpen, onClose, onSubmit, error, admins, onRemove, onUpdateRole, currentUsername }) {
    if (!isOpen) return null;
  
    const handleSubmit = (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      onSubmit({
        github_username: formData.get('github_username'),
        role: formData.get('role')
      });
    };
  
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-[#0a0a0a] border border-gray-800 rounded-lg max-w-2xl w-full">
          <div className="border-b border-gray-800 p-4">
            <h3 className="text-lg font-semibold text-gray-200">
              Manage Admins
            </h3>
          </div>
  
          <div className="p-6 space-y-6">
            <div>
              <h4 className="text-md font-semibold text-gray-300 mb-4">Add New Admin</h4>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label htmlFor="github_username" className="block text-sm text-gray-400 mb-1">
                      GitHub Username
                    </label>
                    <input
                      type="text"
                      id="github_username"
                      name="github_username"
                      required
                      className="w-full p-2 bg-[#1a1a1a] border border-gray-800 rounded text-gray-200 placeholder-gray-500 focus:outline-none focus:border-gray-700"
                      placeholder="Enter GitHub username"
                    />
                  </div>
                  <div className="w-1/3">
                    <label htmlFor="role" className="block text-sm text-gray-400 mb-1">
                      Role
                    </label>
                    <select
                      id="role"
                      name="role"
                      required
                      className="w-full p-2 bg-[#1a1a1a] border border-gray-800 rounded text-gray-200 focus:outline-none focus:border-gray-700"
                    >
                      <option value="viewer">Viewer</option>
                      <option value="admin">Admin</option>
                      <option value="owner">Owner</option>
                    </select>
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full px-4 py-2 rounded text-sm bg-purple-500/10 text-purple-500 hover:bg-purple-500/20 transition-colors"
                >
                  Add Admin
                </button>
                {error && (
                  <p className="text-red-500 text-sm mt-2">{error}</p>
                )}
              </form>
            </div>
  
            <div className="border-t border-gray-800 pt-6">
              <h4 className="text-md font-semibold text-gray-300 mb-4">Current Admins</h4>
              <div className="space-y-3">
                {admins.map((admin) => (
                  <div key={admin.github_username} className="flex items-center justify-between p-3 border border-gray-800 rounded">
                    <div className="flex items-center gap-3">
                      <img 
                        src={`https://github.com/${admin.github_username}.png`}
                        alt={admin.github_username}
                        className="w-8 h-8 rounded-full"
                      />
                      <div>
                        <span className="text-gray-300">{admin.github_username}</span>
                        {admin.github_username === currentUsername && (
                          <span className="ml-2 text-xs bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded">
                            You
                          </span>
                        )}
                      </div>
                    </div>
                    {admin.github_username !== currentUsername && (
                      <div className="flex items-center gap-2">
                        <select
                          value={admin.role}
                          onChange={(e) => onUpdateRole(admin.github_username, e.target.value)}
                          className="bg-[#1a1a1a] border border-gray-800 rounded text-sm text-gray-300 p-1"
                        >
                          <option value="viewer">Viewer</option>
                          <option value="admin">Admin</option>
                          <option value="owner">Owner</option>
                        </select>
                        <button
                          onClick={() => onRemove(admin.github_username)}
                          className="px-2 py-1 rounded text-sm bg-red-500/10 text-red-500 hover:bg-red-500/20"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
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