export default function ConfirmDialog({ isOpen, onClose, onConfirm, title, message, confirmText, cancelText, variant = 'red' }) {
  if (!isOpen) return null;

  // Define button variants to match existing buttons
  const buttonVariants = {
    red: 'bg-red-500/10 text-red-500 hover:bg-red-500/20',
    green: 'bg-green-500/10 text-green-500 hover:bg-green-500/20',
    yellow: 'bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20'
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-[#0a0a0a] border border-gray-800 rounded-lg max-w-md w-full">
        <div className="border-b border-gray-800 p-4">
          <h3 className="text-lg font-semibold text-gray-200">
            {title}
          </h3>
        </div>

        <div className="p-6">
          <p className="text-gray-400">
            {message}
          </p>
        </div>

        <div className="border-t border-gray-800 p-4 flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded text-sm bg-[#1a1a1a] text-gray-300 hover:bg-[#222] transition-colors border border-gray-800"
          >
            {cancelText || 'Cancel'}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`px-4 py-2 rounded text-sm transition-colors ${buttonVariants[variant]}`}
          >
            {confirmText || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
} 