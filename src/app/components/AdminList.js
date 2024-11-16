export default function AdminList({ admins, onRemove, currentUsername }) {
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
              <img 
                src={`https://github.com/${admin.github_username}.png`}
                alt={admin.github_username}
                className="w-8 h-8 rounded-full"
              />
              <span className="text-gray-300">{admin.github_username}</span>
              {admin.github_username === currentUsername && (
                <span className="text-xs bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded">
                  You
                </span>
              )}
            </div>
            {admin.github_username !== currentUsername && (
              <button
                onClick={() => onRemove(admin.github_username)}
                className="px-3 py-1.5 rounded text-sm bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
} 