'use client';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { MobileIcon, DesktopIcon } from '@radix-ui/react-icons';
import { useDeviceDetect } from '../hooks/useDeviceDetect';
import ConfirmDialog from '../components/ConfirmDialog';
import AddUrlDialog from '../components/AddUrlDialog';
import AddAdminDialog from '../components/AddAdminDialog';
import { useRole } from '../hooks/useRole';
import NoAccessDialog from '../components/NoAccessDialog';
import LoadingSpinner from '../components/LoadingSpinner';
import EditUrlDialog from '../components/EditUrlDialog';

const FilterSection = ({ filter, setFilter, search, setSearch, isAdmin, isOwner }) => {
  return (
    <div className="flex flex-col sm:flex-row gap-4 mb-6">
      <select
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="p-2 rounded bg-transparent border border-gray-700 text-gray-300 focus:outline-none focus:border-gray-500 sm:w-[200px]"
      >
        <option value="all">All URLs</option>
        <option value="active">Active URLs</option>
        {(isAdmin || isOwner) && (
          <option value="deprecated">Deprecated URLs</option>
        )}
      </select>

      <input
        type="text"
        placeholder="Search URLs..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full sm:flex-1 p-2 border rounded bg-gray-800 border-gray-700 text-gray-300 placeholder-gray-400 focus:outline-none focus:border-gray-500"
      />
    </div>
  );
};

export default function AdminDashboard() {
  const { data: session, status } = useSession();
  const { role, isAdmin, isOwner } = useRole();
  const [urls, setUrls] = useState([]);
  const [error, setError] = useState(null);
  const [newUrl, setNewUrl] = useState({ short_path: '', redirect_url: '' });
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const isMobileDevice = useDeviceDetect();
  const [isMobileView, setIsMobileView] = useState(true);
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: '',
    variant: '',
    onConfirm: () => {},
  });
  const [isAddUrlOpen, setIsAddUrlOpen] = useState(false);
  const [isAddAdminOpen, setIsAddAdminOpen] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [admins, setAdmins] = useState([]);
  const [showNoAccess, setShowNoAccess] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [urlToDelete, setUrlToDelete] = useState(null);
  const [loadingStates, setLoadingStates] = useState({
    deprecating: new Set(),
    deleting: null
  });
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [urlToEdit, setUrlToEdit] = useState(null);

  useEffect(() => {
    setIsMobileView(isMobileDevice);
  }, [isMobileDevice]);

  const loadUrls = async () => {
    try {
      const res = await fetch('/api/admin-urls');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setUrls(data);
    } catch (err) {
      setError('Failed to load URLs');
    }
  };

  useEffect(() => {
    if (session) loadUrls();
  }, [session]);

  useEffect(() => {
    loadAdmins();
  }, []);

  const loadAdmins = async () => {
    try {
      const res = await fetch('/api/admin-management');
      const data = await res.json();
      if (!data.error) {
        setAdmins(data);
      }
    } catch (error) {
      console.error('Failed to load admins:', error);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin-urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUrl),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setNewUrl({ short_path: '', redirect_url: '' });
      loadUrls();
    } catch (err) {
      setError('Failed to add URL');
    }
  };

  const handleRestrictedAction = (action) => {
    if (!isAdmin && !isOwner) {
      setShowNoAccess(true);
      return;
    }
    action();
  };

  const handleToggleDeprecated = async (url) => {
    handleRestrictedAction(async () => {
      try {
        // Add to loading state
        setLoadingStates(prev => ({
          ...prev,
          deprecating: new Set([...prev.deprecating, url.short_path])
        }));

        const res = await fetch('/api/admin-urls', {
          method: 'PUT',
          headers: { 
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            short_path: url.short_path,
            deprecated: !url.deprecated
          })
        });

        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error || 'Failed to update URL');
        }

        // Refresh the URLs list after successful update
        const updatedRes = await fetch('/api/admin-urls');
        const updatedUrls = await updatedRes.json();
        setUrls(updatedUrls);

      } catch (error) {
        console.error('Failed to toggle deprecated status:', error);
        setError('Failed to update URL status');
      } finally {
        // Remove from loading state
        setLoadingStates(prev => ({
          ...prev,
          deprecating: new Set(
            [...prev.deprecating].filter(path => path !== url.short_path)
          )
        }));
      }
    });
  };

  const handleDelete = async (url) => {
    handleRestrictedAction(() => {
      setLoadingStates(prev => ({
        ...prev,
        deleting: url.short_path
      }));
      setUrlToDelete(url);
      setShowConfirmDelete(true);
    });
  };

  const confirmDelete = async () => {
    if (urlToDelete) {
      try {
        const res = await fetch(`/api/admin-urls`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ short_path: urlToDelete.short_path })
        });

        if (!res.ok) {
          throw new Error('Failed to delete URL');
        }

        // Refresh the URLs list
        loadUrls();
        setShowConfirmDelete(false);
        setUrlToDelete(null);
      } catch (error) {
        console.error('Failed to delete URL:', error);
        setError('Failed to delete URL');
      }
    }
  };

  const handleAddUrl = async (newUrl) => {
    handleRestrictedAction(async () => {
      try {
        const res = await fetch('/api/admin-urls', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newUrl),
        });
        
        if (!res.ok) throw new Error('Failed to add URL');
        loadUrls();
        setIsAddUrlOpen(false);
        setError('');
      } catch (error) {
        console.error('Failed to add URL:', error);
      }
    });
  };

  const handleAddAdmin = async (github_username) => {
    try {
      const res = await fetch('/api/admin-management', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ github_username }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      loadAdmins();
      setAdminError('');
    } catch (err) {
      setAdminError(err.message || 'Failed to add admin');
    }
  };

  const handleRemoveAdmin = async (github_username) => {
    if (!confirm(`Are you sure you want to remove ${github_username} as an admin?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin-management?github_username=${github_username}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      loadAdmins();
    } catch (error) {
      console.error('Failed to remove admin:', error);
    }
  };

  const handleUpdateRole = async (github_username, role) => {
    try {
      const res = await fetch('/api/admin-management', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ github_username, role }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      loadAdmins();
    } catch (error) {
      console.error('Failed to update role:', error);
    }
  };

  const handleAdminAction = (action) => {
    if (!isOwner) {
      setShowNoAccess(true);
      return;
    }
    action();
  };

  const handleEdit = async (data) => {
    try {
      const res = await fetch('/api/admin-urls', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });

      if (!res.ok) {
        throw new Error('Failed to update URL');
      }

      // Refresh the URLs list
      loadUrls();
    } catch (error) {
      console.error('Failed to update URL:', error);
      throw error;
    }
  };

  if (status === 'loading') {
    return <div className="p-8">Loading...</div>;
  }

  if (!session) {
    return (
      <div className="p-8">
        <button 
          onClick={() => signIn('github')} 
          className="bg-blue-500/10 text-blue-500 px-4 py-2 rounded hover:bg-blue-500/20"
        >
          Sign in with GitHub
        </button>
      </div>
    );
  }

  const filteredUrls = urls
    .sort((a, b) => a.short_path.localeCompare(b.short_path))
    .filter(url => {
      if (filter === 'deprecated' && !url.deprecated) return false;
      if (filter === 'active' && url.deprecated) return false;
      
      if (search) {
        const searchLower = search.toLowerCase();
        return (
          url.short_path.toLowerCase().includes(searchLower) ||
          url.redirect_url.toLowerCase().includes(searchLower)
        );
      }
      return true;
    });

  const showManageAdmins = isOwner;
  const showUrlManagement = isAdmin || isOwner;

  return (
    <>
      <div className="max-w-7xl mx-auto p-4">
        <div className={`${isMobileView ? 'flex flex-col items-center' : 'flex justify-between items-center'} mb-6`}>
          <div className="flex items-center gap-4">
            <img 
              src="https://serv.husky.nz/logo/default180.png" 
              width={50} 
              height={50} 
              alt="Logo"
              className="rounded"
            />
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          </div>

          <div className={`${isMobileView ? 'flex flex-col items-center mt-4' : 'flex items-center'} gap-4`}>
            {isMobileView ? (
              // Mobile Layout
              <>
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-3">
                    {session?.user?.image && (
                      <img src={session.user.image} alt="Profile" className="w-8 h-8 rounded-full" />
                    )}
                    <span className="text-gray-300">{session?.user?.name}</span>
                  </div>
                  <button 
                    onClick={() => signOut()} 
                    className="bg-red-500/10 text-red-500 px-4 py-2 rounded hover:bg-red-500/20 text-sm"
                  >
                    Sign Out
                  </button>
                </div>
                <button
                  onClick={() => setIsMobileView(!isMobileView)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded bg-gray-800 text-gray-300 hover:bg-gray-700 text-sm"
                >
                  <DesktopIcon className="w-4 h-4" />
                  Desktop View
                </button>
                <button
                  onClick={() => handleRestrictedAction(() => setIsAddUrlOpen(true))}
                  className="px-4 py-2 rounded text-sm bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition-colors"
                >
                  Add URL
                </button>
                {showManageAdmins && (
                  <button
                    onClick={() => handleAdminAction(() => setIsAddAdminOpen(true))}
                    className="px-4 py-2 rounded text-sm bg-purple-500/10 text-purple-500 hover:bg-purple-500/20 transition-colors"
                  >
                    Manage Admins
                  </button>
                )}
              </>
            ) : (
              // Desktop Layout - Updated
              <>
                <button
                  onClick={() => handleRestrictedAction(() => setIsAddUrlOpen(true))}
                  className="px-4 py-2 rounded text-sm bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition-colors"
                >
                  Add URL
                </button>
                {showManageAdmins && (
                  <button
                    onClick={() => handleAdminAction(() => setIsAddAdminOpen(true))}
                    className="px-4 py-2 rounded text-sm bg-purple-500/10 text-purple-500 hover:bg-purple-500/20 transition-colors"
                  >
                    Manage Admins
                  </button>
                )}
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => signOut()} 
                    className="bg-red-500/10 text-red-500 px-4 py-2 rounded hover:bg-red-500/20 text-sm"
                  >
                    Sign Out
                  </button>
                  {session?.user?.image && (
                    <img src={session.user.image} alt="Profile" className="w-8 h-8 rounded-full" />
                  )}
                  <span className="text-gray-300">{session?.user?.name}</span>
                </div>
              </>
            )}
          </div>
        </div>

        <FilterSection 
          filter={filter}
          setFilter={setFilter}
          search={search}
          setSearch={setSearch}
          isAdmin={isAdmin}
          isOwner={isOwner}
        />

        <div className={`grid gap-4 ${isMobileView ? 'max-w-sm mx-auto' : ''}`}>
          {filteredUrls.map((url) => (
            <div 
              key={url.short_path} 
              className="border border-gray-700 p-4 rounded-lg transition-all duration-200 hover:border-gray-600"
            >
              {isMobileView ? (
                // Mobile Layout
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="font-mono text-sm break-all">/{url.short_path}</p>
                    <p className="text-gray-400 text-sm break-all">
                      Redirects to: <a href={url.redirect_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                        {url.redirect_url}
                      </a>
                    </p>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      url.deprecated 
                        ? 'bg-red-500/10 text-red-500' 
                        : 'bg-green-500/10 text-green-500'
                    }`}>
                      {url.deprecated ? 'Deprecated' : 'Active'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => handleToggleDeprecated(url)}
                      disabled={loadingStates.deprecating.has(url.short_path)}
                      className={`px-3 py-1.5 rounded text-sm inline-flex items-center gap-2 ${
                        url.deprecated 
                          ? 'bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20' 
                          : 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {loadingStates.deprecating.has(url.short_path) ? (
                        <>
                          <LoadingSpinner />
                          <span>{url.deprecated ? 'Activating...' : 'Deprecating...'}</span>
                        </>
                      ) : (
                        url.deprecated ? 'Activate' : 'Deprecate'
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setUrlToEdit(url);
                        setShowEditDialog(true);
                      }}
                      className="px-3 py-1.5 rounded text-sm bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(url)}
                      disabled={loadingStates.deleting === url.short_path}
                      className="px-3 py-1.5 rounded text-sm inline-flex items-center gap-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loadingStates.deleting === url.short_path ? (
                        <>
                          <LoadingSpinner />
                          <span>Deleting...</span>
                        </>
                      ) : (
                        'Delete'
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                // Desktop Layout
                <div className="flex items-center justify-between">
                  <div className="flex-1 pr-4">
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-sm">/{ url.short_path }</p>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        url.deprecated 
                          ? 'bg-red-500/10 text-red-500' 
                          : 'bg-green-500/10 text-green-500'
                      }`}>
                        {url.deprecated ? 'Deprecated' : 'Active'}
                      </span>
                    </div>
                    <p className="text-gray-400 text-sm truncate">
                      {url.redirect_url}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setUrlToEdit(url);
                        setShowEditDialog(true);
                      }}
                      className="px-3 py-1.5 rounded text-sm bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleToggleDeprecated(url)}
                      disabled={loadingStates.deprecating.has(url.short_path)}
                      className={`px-3 py-1.5 rounded text-sm inline-flex items-center gap-2 ${
                        url.deprecated 
                          ? 'bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20' 
                          : 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {loadingStates.deprecating.has(url.short_path) ? (
                        <>
                          <LoadingSpinner />
                          <span>{url.deprecated ? 'Activating...' : 'Deprecating...'}</span>
                        </>
                      ) : (
                        url.deprecated ? 'Activate' : 'Deprecate'
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(url)}
                      disabled={loadingStates.deleting === url.short_path}
                      className="px-3 py-1.5 rounded text-sm inline-flex items-center gap-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loadingStates.deleting === url.short_path ? (
                        <>
                          <LoadingSpinner />
                          <span>Deleting...</span>
                        </>
                      ) : (
                        'Delete'
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        variant={confirmDialog.variant}
      />

      <AddUrlDialog
        isOpen={isAddUrlOpen}
        onClose={() => {
          setIsAddUrlOpen(false);
          setError('');
        }}
        onSubmit={handleAddUrl}
        error={error}
      />

      {showManageAdmins && (
        <AddAdminDialog
          isOpen={isAddAdminOpen}
          onClose={() => {
            setIsAddAdminOpen(false);
            setAdminError('');
          }}
          onSubmit={handleAddAdmin}
          onUpdateRole={handleUpdateRole}
          error={adminError}
          admins={admins}
          onRemove={handleRemoveAdmin}
          currentUsername={session?.user?.username}
        />
      )}

      <NoAccessDialog 
        isOpen={showNoAccess} 
        onClose={() => setShowNoAccess(false)} 
      />

      <ConfirmDialog
        isOpen={showConfirmDelete}
        onClose={() => {
          setShowConfirmDelete(false);
          setUrlToDelete(null);
        }}
        onConfirm={confirmDelete}
        title="Delete URL"
        message={`Are you sure you want to delete /${urlToDelete?.short_path}?`}
        confirmText="Delete"
        variant="red"
      />

      <EditUrlDialog
        isOpen={showEditDialog}
        onClose={() => {
          setShowEditDialog(false);
          setUrlToEdit(null);
        }}
        url={urlToEdit}
        onSubmit={handleEdit}
      />
    </>
  );
} 