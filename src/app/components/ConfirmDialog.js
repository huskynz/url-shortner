export default function ConfirmDialog({ 
  isOpen, 
  visible,
  onClose = () => {}, 
  onConfirm = () => {}, 
  title = 'Confirm', 
  message = 'Are you sure?',
  confirmText = 'Confirm',
  variant = 'danger'
}) {
  if (!isOpen && !visible) return null;

  const buttonVariants = {
    danger: 'bg-red-500/10 text-red-500 hover:bg-red-500/20',
    warning: 'bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20',
    success: 'bg-green-500/10 text-green-500 hover:bg-green-500/20',
    red: 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
      <div className="bg-[#0a0a0a] border border-gray-800 rounded-lg max-w-md w-full">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-200 mb-2">
            {title}
          </h3>
          <p className="text-gray-400 text-sm">
            {message}
          </p>
        </div>
        <div className="border-t border-gray-800 p-4 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded text-sm bg-[#1a1a1a] text-gray-300 hover:bg-[#222] border border-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`px-4 py-2 rounded text-sm transition-colors ${buttonVariants[variant]}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
} 