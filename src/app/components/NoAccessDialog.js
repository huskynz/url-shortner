export default function NoAccessDialog({ isOpen, onClose }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-[#0a0a0a] border border-gray-800 rounded-lg max-w-md w-full">
        <div className="border-b border-gray-800 p-4">
          <h3 className="text-lg font-semibold text-gray-200">
            Access Denied
          </h3>
        </div>
        
        <div className="p-6">
          <p className="text-gray-300">
            You don't have permission to perform this action. Please contact your admin for more information.

          </p>
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