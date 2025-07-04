export default function AdminList({ admins, onRemove, onUpdateRole, currentEmail }) {
  return (
    <div className="border border-gray-800 rounded-lg overflow-hidden">
      <div className="border-b border-gray-800 p-4">
        <h3 className="text-lg font-semibold text-gray-200">
          Admin Users
        </h3>
      </div>

      <div className="divide-y divide-gray-800">
        {admins.map((admin) => (
          <div key={admin.id} className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {admin.github_username && (
                <img 
                  src={`https://github.com/${admin.github_username}.png`}
                  alt={admin.github_username}
                  className="w-8 h-8 rounded-full"
                />
              )}
              <div className="flex flex-col">
                <span className="text-gray-300">{admin.github_username || admin.email}</span>
                <span className="text-xs text-gray-500">{admin.role}</span>
              </div>
              {admin.email === currentEmail && (
                <span className="text-xs bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded">
                  You
                </span>
              )}
            </div>
            {admin.email !== currentEmail && (
              <>
                <select
                  value={admin.role}
                  onChange={(e) => onUpdateRole(admin.email, e.target.value)}
                  className="bg-[#1a1a1a] border border-gray-800 rounded text-sm text-gray-300 p-1"
                >
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                  <option value="owner">Owner</option>
                </select>
                <button
                  onClick={() => onRemove(admin.email)}
                  className="px-3 py-1.5 rounded text-sm bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                >
                  Remove
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
} 