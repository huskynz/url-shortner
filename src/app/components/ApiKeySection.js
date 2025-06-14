import { useState } from 'react';
import { CopyIcon, CheckIcon, TrashIcon, PlusIcon } from '@radix-ui/react-icons';
import LoadingSpinner from './LoadingSpinner';

export default function ApiKeySection({
  apiKeys,
  isLoadingApiKeys,
  apiKeyError,
  onAddApiKey,
  onDeleteApiKey,
  onEditApiKey,
  loadApiKeys,
}) {
  const [copiedKey, setCopiedKey] = useState(null);

  const handleCopy = async (key) => {
    await navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="bg-[#0f0f0f] rounded-lg shadow-xl border border-[#2a2a2a] p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-100">API Keys</h2>
        <button
          onClick={onAddApiKey}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition duration-200 ease-in-out shadow-lg"
        >
          <PlusIcon className="w-4 h-4" />
          Add API Key
        </button>
      </div>

      {isLoadingApiKeys ? (
        <LoadingSpinner />
      ) : apiKeyError ? (
        <div className="bg-red-900 text-red-200 px-4 py-3 rounded-lg mb-6 shadow-md" role="alert">
          {apiKeyError}
        </div>
      ) : apiKeys.length === 0 ? (
        <p className="text-gray-400">No API keys found. Create one to get started.</p>
      ) : (
        <div className="space-y-4">
          {apiKeys.map((key) => (
            <div
              key={key.id}
              className="bg-[#1a1a1a] p-4 rounded-lg shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border border-[#2a2a2a]"
            >
              <div className="flex flex-col">
                <h3 className="text-lg font-semibold text-gray-200">{key.name}</h3>
                <div className="flex items-center gap-4 text-sm text-gray-400 mt-1">
                  <span>Created: {new Date(key.created_at).toLocaleDateString()}</span>
                  {key.expires_at && (
                    <span>Expires: {new Date(key.expires_at).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 sm:ml-auto">
                <button
                  onClick={() => handleCopy(key.key)}
                  className="px-3 py-1 rounded-md bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium transition duration-200 ease-in-out flex items-center gap-1"
                >
                  {copiedKey === key.key ? (
                    <>
                      <CheckIcon className="w-4 h-4" />
                      Copied
                    </>
                  ) : (
                    <>
                      <CopyIcon className="w-4 h-4" />
                      Copy
                    </>
                  )}
                </button>
                <button
                  onClick={() => onDeleteApiKey(key.id)}
                  className="px-3 py-1 rounded-md bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition duration-200 ease-in-out"
                >
                  <TrashIcon className="w-4 h-4 inline-block mr-1" />
                  Revoke
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 