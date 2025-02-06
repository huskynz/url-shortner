import { useState, useEffect, useRef } from 'react';
import { ChevronDownIcon } from '@radix-ui/react-icons';
import { useRole } from '../api/hooks/useRole';
import { Dialog } from '@headlessui/react';

export default function AddAdminDialog({ 
  isOpen, 
  onClose, 
  onSubmit, 
  error, 
  admins, 
  onRemove, 
  onUpdateRole, 
  currentUsername 
}) {
  const { isAdmin, isOwner } = useRole();
  const [openDropdown, setOpenDropdown] = useState(null);
  const [newAdminRole, setNewAdminRole] = useState('viewer');
  const dropdownRefs = useRef({});

  useEffect(() => {
    function handleClickOutside(event) {
      if (openDropdown && 
          dropdownRefs.current[openDropdown] && 
          !dropdownRefs.current[openDropdown].contains(event.target)) {
        setOpenDropdown(null);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openDropdown]);

  const roleOptions = [
    { value: 'viewer', label: 'Viewer' },
    { value: 'admin', label: 'Admin' },
    { value: 'owner', label: 'Owner' }
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    onSubmit({
      github_username: formData.get('github_username'),
      role: newAdminRole
    });
  };

  return (
    <Dialog 
      open={isOpen} 
      onClose={onClose}
      className="fixed inset-0 z-50 overflow-y-auto"
    >
      <div className="flex min-h-screen items-center justify-center">
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        
        <div className="relative bg-gray-900 p-6 rounded-lg max-w-md w-full mx-4">
          <Dialog.Title className="text-xl font-semibold mb-4">
            Manage Admins
          </Dialog.Title>

          <div className="p-6 space-y-6">
            {/* Add New Admin Form */}
            {isOwner && (
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
                      <label className="block text-sm text-gray-400 mb-1">
                        Role
                      </label>
                      <div 
                        ref={el => dropdownRefs.current['newAdmin'] = el} 
                        className="relative"
                      >
                        <button
                          type="button"
                          onClick={() => setOpenDropdown(openDropdown === 'newAdmin' ? null : 'newAdmin')}
                          className="w-full px-3 py-2 rounded text-sm bg-[#1a1a1a] border border-gray-800 text-gray-300 hover:bg-[#222] transition-colors flex items-center justify-between"
                        >
                          <span>{roleOptions.find(r => r.value === newAdminRole)?.label}</span>
                          <ChevronDownIcon className={`transition-transform ${openDropdown === 'newAdmin' ? 'rotate-180' : ''}`} />
                        </button>
                        
                        {openDropdown === 'newAdmin' && (
                          <div className="absolute top-full mt-1 w-full bg-[#1a1a1a] border border-gray-800 rounded-lg overflow-hidden shadow-lg z-10">
                            {roleOptions.map((role) => (
                              <button
                                key={role.value}
                                type="button"
                                onClick={() => {
                                  setNewAdminRole(role.value);
                                  setOpenDropdown(null);
                                }}
                                className={`w-full px-3 py-1.5 text-left text-sm hover:bg-[#222] transition-colors ${
                                  newAdminRole === role.value ? 'text-blue-400' : 'text-gray-300'
                                }`}
                              >
                                {role.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {error && (
                    <p className="text-red-500 text-sm">{error}</p>
                  )}
                  
                  <button
                    type="submit"
                    className="w-full px-4 py-2 bg-blue-500/10 text-blue-500 rounded hover:bg-blue-500/20 transition-colors"
                  >
                    Add Admin
                  </button>
                </form>
              </div>
            )}

            {/* Existing Admins List */}
            <div>
              <h4 className="text-md font-semibold text-gray-300 mb-4">Existing Admins</h4>
              <div className="space-y-3">
                {admins.map((admin) => (
                  <div 
                    key={admin.github_username}
                    className="flex items-center justify-between p-3 rounded bg-[#1a1a1a] border border-gray-800"
                  >
                    <span className="text-gray-300">{admin.github_username}</span>
                    
                    <div className="flex items-center gap-2">
                      {isOwner && admin.github_username !== currentUsername && (
                        <div 
                          ref={el => dropdownRefs.current[admin.github_username] = el}
                          className="relative"
                        >
                          <button
                            type="button"
                            onClick={() => setOpenDropdown(openDropdown === admin.github_username ? null : admin.github_username)}
                            className="px-3 py-1.5 rounded text-sm bg-[#222] text-gray-300 hover:bg-[#333] transition-colors flex items-center gap-2"
                          >
                            {roleOptions.find(r => r.value === admin.role)?.label}
                            <ChevronDownIcon className={`transition-transform ${openDropdown === admin.github_username ? 'rotate-180' : ''}`} />
                          </button>
                          
                          {openDropdown === admin.github_username && (
                            <div className="absolute right-0 mt-1 w-32 bg-[#1a1a1a] border border-gray-800 rounded-lg overflow-hidden shadow-lg z-10">
                              {roleOptions.map((role) => (
                                <button
                                  key={role.value}
                                  type="button"
                                  onClick={() => {
                                    onUpdateRole(admin.github_username, role.value);
                                    setOpenDropdown(null);
                                  }}
                                  className={`w-full px-3 py-1.5 text-left text-sm hover:bg-[#222] transition-colors ${
                                    admin.role === role.value ? 'text-blue-400' : 'text-gray-300'
                                  }`}
                                >
                                  {role.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      
                      {isOwner && admin.github_username !== currentUsername && (
                        <button
                          onClick={() => onRemove(admin.github_username)}
                          className="p-1.5 rounded text-red-500 hover:bg-red-500/10 transition-colors"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-400 hover:text-gray-300 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}