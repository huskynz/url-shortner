'use client';
import { Cross2Icon } from '@radix-ui/react-icons';

export default function Dialog({ isOpen, onClose, title, children }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div className="bg-gray-800 border border-gray-700 rounded-lg max-w-2xl w-full shadow-xl animate-slideUp">
        <div className="border-b border-gray-700 p-4 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-100">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-700 transition-colors"
          >
            <Cross2Icon className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
} 