'use client';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { 
  MobileIcon, 
  DesktopIcon, 
  BarChartIcon, 
  Link2Icon,
  GearIcon,
  HomeIcon,
  PersonIcon,
  KeyboardIcon,
  GlobeIcon,
  ChevronDownIcon,
  ExitIcon,
  Cross2Icon,
  PlusIcon,
  TrashIcon,
  Pencil1Icon,
  CheckIcon,
  ExclamationTriangleIcon,
  CopyIcon,
  EyeOpenIcon,
  EyeClosedIcon,
  LockClosedIcon,
  LockOpen2Icon,
  ListBulletIcon,
  GridIcon,
  StarIcon,
  StarFilledIcon,
  MixerHorizontalIcon,
  ChevronUpIcon,
  ClockIcon,
  MagnifyingGlassIcon
} from '@radix-ui/react-icons';
import { useDeviceDetect } from '../hooks/useDeviceDetect';
import ConfirmDialog from '../components/ConfirmDialog';
import AddUrlDialog from '../components/AddUrlDialog';
import AddAdminDialog from '../components/AddAdminDialog';
import { useRole } from '../hooks/useRole';
import NoAccessDialog from '../components/NoAccessDialog';
import LoadingSpinner from '../components/LoadingSpinner';
import EditUrlDialog from '../components/EditUrlDialog';
import ApiKeyDialog from '../components/ApiKeyDialog';
import AnalyticsDashboard from '../components/AnalyticsDashboard';


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
        <option value="favorites">Favorite URLs</option>
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
  const [newAdminRole, setNewAdminRole] = useState('viewer');
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
  const [isApiKeyDialogOpen, setIsApiKeyDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState(null);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [apiKeys, setApiKeys] = useState([]);
  const [isLoadingApiKeys, setIsLoadingApiKeys] = useState(true);
  const [apiKeyError, setApiKeyError] = useState(null);
  const [showNewKey, setShowNewKey] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);
  const [activeSettingsTab, setActiveSettingsTab] = useState('admin');
  const [showCreateApiKeyForm, setShowCreateApiKeyForm] = useState(false);
  const [newApiKeyName, setNewApiKeyName] = useState('');
  const [createApiKeyError, setCreateApiKeyError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [favorites, setFavorites] = useState(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: 'short_path', direction: 'asc' });
  const [copiedUrl, setCopiedUrl] = useState(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  useEffect(() => {
    setIsMobileView(isMobileDevice);
  }, [isMobileDevice]);

  const handleCopyUrl = async (shortPath) => {
    try {
      const fullUrl = `${window.location.origin}/${shortPath}`;
      await navigator.clipboard.writeText(fullUrl);
      setCopiedUrl(shortPath);
      setTimeout(() => setCopiedUrl(null), 2000);
    } catch (error) {
      setError('Failed to copy URL to clipboard');
    }
  };

  const clearSearch = () => {
    setSearch('');
  };

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const toggleFavorite = (shortPath) => {
    setFavorites(prev => {
      const newFavorites = new Set(prev);
      if (newFavorites.has(shortPath)) {
        newFavorites.delete(shortPath);
      } else {
        newFavorites.add(shortPath);
      }
      return newFavorites;
    });
  };

  const clearAllFavorites = () => {
    setFavorites(new Set());
    setSuccessMessage('All favorites cleared.');
    setTimeout(() => setSuccessMessage(''), 3000);
  };

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

  const loadAnalytics = async () => {
    try {
      setAnalyticsLoading(true);
      const res = await fetch('/api/admin-analytics');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAnalytics(data);
      setAnalyticsError(null);
    } catch (err) {
      setAnalyticsError('Failed to load analytics data');
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const loadApiKeys = async () => {
    try {
      setIsLoadingApiKeys(true);
      const res = await fetch('/api/admin-keys');
      if (!res.ok) throw new Error('Failed to load API keys');
      const data = await res.json();
      setApiKeys(data);
      setApiKeyError(null);
    } catch (error) {
      setApiKeyError('Failed to load API keys');
    } finally {
      setIsLoadingApiKeys(false);
    }
  };

  const handleCreateKey = async (name, expiration) => {
    try {
      const res = await fetch('/api/admin-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, expiration }),
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to create API key');
      }
      const data = await res.json();
      setShowNewKey(data.key);
      loadApiKeys();
      setNewApiKeyName('');
      setShowCreateApiKeyForm(false);
      setCreateApiKeyError('');
      setSuccessMessage('API Key generated successfully.');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      setCreateApiKeyError(error.message || 'Failed to create API key');
      setApiKeyError(error.message || 'Failed to create API key');
    }
  };

  const handleDeleteKey = async (keyId) => {
    try {
      const res = await fetch(`/api/admin-keys/${keyId}`, {
        method: 'DELETE',
      });
      
      if (!res.ok) throw new Error('Failed to delete API key');
      loadApiKeys();
      setSuccessMessage(`API Key deleted successfully.`);
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      setApiKeyError('Failed to delete API key');
    }
  };

  const handleCopyKey = async (key) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (error) {
      // console.error('Error copying key:', error);
      setError('Failed to copy key to clipboard.');
    }
  };

  useEffect(() => {
    if (session) {
      loadUrls();
      loadAnalytics();
      loadAdmins();
      loadApiKeys();
    }
  }, [session]);

  const loadAdmins = async () => {
    try {
      const res = await fetch('/api/admin-management');
      const data = await res.json();
      if (!data.error) {
        setAdmins(data);
      }
    } catch (error) {
      setError('Failed to load admins');
    }
  };

  const handleAddUrl = async (urlData) => {
    handleRestrictedAction(async () => {
      try {
        const res = await fetch('/api/admin-urls', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(urlData),
        });
        
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || 'Failed to add URL');
        }
        loadUrls();
        setIsAddUrlOpen(false);
        setError('');
        setSuccessMessage(`URL '/${urlData.short_path}' added successfully.`);
        setTimeout(() => setSuccessMessage(''), 3000);
        setNewUrl({ short_path: '', redirect_url: '' });
      } catch (error) {
        console.log("Error in handleAddUrl:", error);
        setError(error.message || 'Failed to add URL');
      }
    });
  };

  const handleRestrictedAction = async (action) => {
    if (!isAdmin && !isOwner) {
      setShowNoAccess(true);
      return;
    }
    try {
      await action();
    } catch (error) {
      console.log("Error in handleRestrictedAction:", error);
      setError(error.message || 'An unexpected error occurred.');
    }
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

  const handleCancelDelete = () => {
    setShowConfirmDelete(false);
    setUrlToDelete(null);
    // Reset the loading state for the button
    setLoadingStates(prev => ({
      ...prev,
      deleting: null
    }));
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
        setSuccessMessage(`URL '/${urlToDelete.short_path}' deleted successfully.`);
        setTimeout(() => setSuccessMessage(''), 3000);
      } catch (error) {
        setError('Failed to delete URL');
      }
    }
  };

  const handleInlineAddUrlSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    handleAddUrl({
      short_path: formData.get('short_path'),
      redirect_url: formData.get('redirect_url')
    });
  };

  const handleAddAdmin = async (github_username) => {
    try {
      const res = await fetch('/api/admin-management', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ github_username, role: newAdminRole }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      loadAdmins();
      setAdminError('');
      setNewAdminRole('viewer');
      setSuccessMessage(`Admin '${github_username}' added successfully.`);
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.log("Error in handleAddAdmin:", err);
      setAdminError(err.message || 'Failed to add admin');
    }
  };

  const handleRemoveAdmin = async (github_username) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Confirm Admin Removal',
      message: `Are you sure you want to remove ${github_username} as an admin? This action cannot be undone.`,
      confirmText: 'Remove',
      variant: 'danger',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/admin-management`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ github_username }),
          });
          const data = await res.json();
          if (data.error) throw new Error(data.error);
          loadAdmins();
          setSuccessMessage(`Admin '${github_username}' removed successfully.`);
          setTimeout(() => setSuccessMessage(''), 3000);
        } catch (error) {
          setAdminError(error.message || 'Failed to remove admin');
        } finally {
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        }
      },
    });
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
      setSuccessMessage(`Admin '${github_username}' role updated to '${role}' successfully.`);
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      setError('Failed to update role');
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
    handleRestrictedAction(async () => {
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
        setSuccessMessage(`URL '/${data.short_path}' updated successfully.`);
        setTimeout(() => setSuccessMessage(''), 3000);
      } catch (error) {
        setError('Failed to update URL');
        throw error;
      }
    });
  };

  const renderOverview = () => (
    <div className="space-y-8">
      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition-all duration-200 hover:shadow-lg hover:shadow-blue-500/5 group">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500/10 rounded-lg group-hover:bg-blue-500/20 transition-colors duration-200">
              <Link2Icon className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-gray-400 mb-1">Total URLs</p>
              <p className="text-2xl font-semibold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                {urls.length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition-all duration-200 hover:shadow-lg hover:shadow-green-500/5 group">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-500/10 rounded-lg group-hover:bg-green-500/20 transition-colors duration-200">
              <PersonIcon className="w-6 h-6 text-green-500" />
            </div>
            <div>
              <p className="text-sm text-gray-400 mb-1">Total Admins</p>
              <p className="text-2xl font-semibold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                {admins.length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition-all duration-200 hover:shadow-lg hover:shadow-yellow-500/5 group">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-yellow-500/10 rounded-lg group-hover:bg-yellow-500/20 transition-colors duration-200">
              <KeyboardIcon className="w-6 h-6 text-yellow-500" />
            </div>
            <div>
              <p className="text-sm text-gray-400 mb-1">API Keys</p>
              <p className="text-2xl font-semibold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                {apiKeys.length || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition-all duration-200 hover:shadow-lg hover:shadow-purple-500/5 group">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-500/10 rounded-lg group-hover:bg-purple-500/20 transition-colors duration-200">
              <BarChartIcon className="w-6 h-6 text-purple-500" />
            </div>
            <div>
              <p className="text-sm text-gray-400 mb-1">Total Visits</p>
              <p className="text-2xl font-semibold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                {analytics?.totalVisits?.toLocaleString() || 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-200 mb-4">Recent Activity</h3>
        <div className="space-y-4">
          {analytics?.recentVisits?.slice(0, 5).map((visit, index) => (
            <div
              key={index}
              className="flex items-center gap-4 p-3 bg-[#0a0a0a] border border-gray-800 rounded-lg hover:border-gray-700 transition-all duration-200"
            >
              <div className="w-8 h-8 flex items-center justify-center bg-green-500/10 rounded-lg text-green-500">
                <GlobeIcon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-gray-200 font-medium truncate">/{visit.short_path}</p>
                <p className="text-sm text-gray-400 truncate">
                  {visit.user_agent}
                </p>
              </div>
              <div className="text-sm text-gray-400">
                {visit.environment}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="space-y-8">
      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setActiveSettingsTab('admin')}
          className={`px-4 py-2 text-sm font-medium transition-colors rounded-lg flex items-center gap-2 ${
            activeSettingsTab === 'admin'
              ? 'bg-gray-800 text-gray-200' : 'text-gray-400 hover:bg-gray-800/50'
          }`}
        >
          <PersonIcon className="w-4 h-4" />
          Admin Management
        </button>
        <button
          onClick={() => setActiveSettingsTab('api-keys')}
          className={`px-4 py-2 text-sm font-medium transition-colors rounded-lg flex items-center gap-2 ${
            activeSettingsTab === 'api-keys'
              ? 'bg-gray-800 text-gray-200' : 'text-gray-400 hover:bg-gray-800/50'
          }`}
        >
          <KeyboardIcon className="w-4 h-4" />
          API Keys
        </button>
      </div>

      {activeSettingsTab === 'admin' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Add New Admin Section */}
          {showManageAdmins ? (
            <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-gray-200 mb-4">Add New Admin</h3>
              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                handleAddAdmin(formData.get('github_username'));
              }} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    GitHub Username
                  </label>
                  <input
                    type="text"
                    name="github_username"
                    className="w-full p-2 rounded-lg bg-[#0a0a0a] border border-gray-800 text-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                    placeholder="Enter GitHub username"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Role</label>
                  <div className="flex rounded-lg border border-gray-800 overflow-hidden bg-[#1a1a1a] p-1">
                    <button
                      type="button"
                      onClick={() => setNewAdminRole('viewer')}
                      className={`flex-1 px-4 py-2 text-sm font-medium transition-colors rounded-lg ${
                        newAdminRole === 'viewer'
                          ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700/50'
                      }`}
                    >
                      Viewer
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewAdminRole('admin')}
                      className={`flex-1 px-4 py-2 text-sm font-medium transition-colors rounded-lg ${
                        newAdminRole === 'admin'
                          ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700/50'
                      }`}
                    >
                      Admin
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewAdminRole('owner')}
                      className={`flex-1 px-4 py-2 text-sm font-medium transition-colors rounded-lg ${
                        newAdminRole === 'owner'
                          ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700/50'
                      }`}
                    >
                      Owner
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    {newAdminRole === 'viewer' && 'Read-only access to view URLs and analytics'}
                    {newAdminRole === 'admin' && 'Manage URLs and view analytics'}
                    {newAdminRole === 'owner' && 'Full access to all features, including admin management and API keys'}
                  </p>
                </div>
                {adminError && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <p className="text-sm text-red-500">{adminError}</p>
                  </div>
                )}
                <button
                  type="submit"
                  className="w-full px-4 py-3 rounded-lg text-lg bg-purple-500 text-white hover:bg-purple-600 transition-colors flex items-center justify-center gap-2 mt-6"
                >
                  <PlusIcon className="w-5 h-5" />
                  Add Admin
                </button>
              </form>
            </div>
          ) : (
            <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-6">
              <p className="text-gray-400">You don't have permission to add new admins.</p>
            </div>
          )}

          {/* Admin Users List */}
          <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-200 mb-4">Admin Users</h3>
            {admins.length === 0 ? (
              <div className="p-4 bg-[#0a0a0a] border border-gray-800 rounded-lg">
                <p className="text-gray-400">No admin users found.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {admins.map((admin) => (
                  <div
                    key={admin.github_username}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-[#0a0a0a] border border-gray-800 rounded-lg hover:border-gray-700 transition-colors"
                  >
                    <div className="flex items-center gap-4 mb-3 sm:mb-0">
                      <img
                        src={`https://github.com/${admin.github_username}.png`}
                        alt={admin.github_username}
                        className="w-10 h-10 rounded-full"
                      />
                      <div>
                        <p className="text-gray-200 font-medium">{admin.github_username}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            admin.role === 'owner' 
                              ? 'bg-purple-500/10 text-purple-500' 
                              : admin.role === 'admin' ? 'bg-blue-500/10 text-blue-500' : 'bg-gray-500/10 text-gray-500'
                          }`}>
                            {admin.role}
                          </span>
                          {admin.github_username === session?.user?.username && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-500">
                              You
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {admin.github_username !== session?.user?.username ? (
                      <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
                        <div className="flex rounded-lg border border-gray-800 overflow-hidden bg-[#1a1a1a] p-1 w-full sm:w-auto">
                          <button
                            type="button"
                            onClick={() => handleUpdateRole(admin.github_username, 'viewer')}
                            className={`flex-1 px-3 py-1.5 text-sm font-medium transition-colors rounded-lg ${
                              admin.role === 'viewer'
                                ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700/50'
                            }`}
                          >
                            Viewer
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateRole(admin.github_username, 'admin')}
                            className={`flex-1 px-3 py-1.5 text-sm font-medium transition-colors rounded-lg ${
                              admin.role === 'admin'
                                ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700/50'
                            }`}
                          >
                            Admin
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateRole(admin.github_username, 'owner')}
                            className={`flex-1 px-3 py-1.5 text-sm font-medium transition-colors rounded-lg ${
                              admin.role === 'owner'
                                ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700/50'
                            }`}
                          >
                            Owner
                          </button>
                        </div>
                        <button
                          onClick={() => handleRemoveAdmin(admin.github_username)}
                          className="px-3 py-1.5 rounded-lg text-sm bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors font-medium w-full sm:w-auto"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 italic">Cannot modify own role</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeSettingsTab === 'api-keys' && (
        <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-200">API Keys</h3>
              <p className="text-sm text-gray-400 mt-1">Manage your API keys for programmatic access</p>
            </div>
            {showManageAdmins && (
              <button
                onClick={() => setShowCreateApiKeyForm(true)}
                className="px-4 py-2 rounded-lg text-sm bg-yellow-500 text-white hover:bg-yellow-600 transition-colors flex items-center gap-2"
              >
                <PlusIcon className="w-4 h-4" />
                Generate New Key
              </button>
            )}
          </div>

          {showManageAdmins ? (
            <div className="space-y-6">
              {/* Create API Key Form */}
              {showCreateApiKeyForm && (
                <div className="p-4 bg-[#0a0a0a] border border-gray-800 rounded-lg">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-md font-medium text-gray-300">Generate New API Key</h4>
                    <button
                      onClick={() => {
                        setShowCreateApiKeyForm(false);
                        setNewApiKeyName('');
                        setCreateApiKeyError('');
                      }}
                      className="p-1 hover:bg-gray-700 rounded transition-colors"
                    >
                      <Cross2Icon className="w-4 h-4 text-gray-400" />
                    </button>
                  </div>
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    handleCreateKey(newApiKeyName, '30d'); // Expiration hardcoded for now
                  }} className="space-y-3">
                    <div>
                      <label htmlFor="apiKeyName" className="block text-sm font-medium text-gray-400 mb-2">
                        Key Name
                      </label>
                      <input
                        type="text"
                        id="apiKeyName"
                        value={newApiKeyName}
                        onChange={(e) => setNewApiKeyName(e.target.value)}
                        className="w-full p-2 rounded-lg bg-[#1a1a1a] border border-gray-700 text-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                        placeholder="e.g., My Personal Key"
                        required
                      />
                    </div>
                    {createApiKeyError && (
                      <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                        <p className="text-sm text-red-500">{createApiKeyError}</p>
                      </div>
                    )}
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setShowCreateApiKeyForm(false);
                          setNewApiKeyName('');
                          setCreateApiKeyError('');
                        }}
                        className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-300 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 rounded-lg text-sm bg-blue-500 text-white hover:bg-blue-600 transition-colors flex items-center gap-2"
                      >
                        <PlusIcon className="w-4 h-4" />
                        Generate Key
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Security Warning */}
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <div className="flex items-start gap-3">
                  <ExclamationTriangleIcon className="w-5 h-5 text-yellow-500 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-medium text-yellow-500 mb-1">API Key Security</h3>
                    <p className="text-sm text-gray-400">
                      Keep your API keys secure and never share them publicly. Each key has full access to your account.
                    </p>
                  </div>
                </div>
              </div>

              {/* New Key Display */}
              {showNewKey && (
                <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-green-500 text-sm font-medium">New API Key Created</p>
                    <button
                      onClick={() => setShowNewKey(null)}
                      className="p-1 hover:bg-green-500/20 rounded transition-colors"
                    >
                      <Cross2Icon className="w-4 h-4 text-green-500" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 bg-[#0a0a0a] rounded font-mono text-sm text-gray-300 break-all">
                      {showNewKey}
                    </code>
                    <button
                      onClick={() => handleCopyKey(showNewKey)}
                      className="p-2 text-gray-400 hover:text-gray-300 transition-colors"
                      title="Copy Key"
                    >
                      {copiedKey === showNewKey ? (
                        <CheckIcon className="w-4 h-4" />
                      ) : (
                        <CopyIcon className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    Make sure to copy this key now. You won't be able to see it again!
                  </p>
                </div>
              )}

              {/* API Keys List */}
              {isLoadingApiKeys ? (
                <div className="flex justify-center py-8">
                  <LoadingSpinner />
                </div>
              ) : apiKeyError ? (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <p className="text-sm text-red-500">{apiKeyError}</p>
                </div>
              ) : (
                apiKeys.length === 0 ? (
                  <div className="p-4 bg-[#0a0a0a] border border-gray-800 rounded-lg">
                    <p className="text-gray-400">No API keys found. Create one to get started.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {apiKeys.map((key) => (
                      <div
                        key={key.id}
                        className="p-4 bg-[#0a0a0a] border border-gray-800 rounded-lg hover:border-gray-700 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <p className="text-gray-200 font-medium">{key.name}</p>
                            <p className="text-sm text-gray-400 mt-1">
                              Created: {new Date(key.created_at).toLocaleDateString()}
                              {key.expires_at && ` · Expires: ${new Date(key.expires_at).toLocaleDateString()}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleDeleteKey(key.id)}
                              className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                              title="Revoke Key"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <div className="p-3 bg-[#1a1a1a] rounded-lg font-mono text-sm text-gray-400">
                          ••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {/* Usage Instructions */}
              <div className="p-4 bg-[#0a0a0a] border border-gray-800 rounded-lg">
                <h4 className="text-md font-medium text-gray-300 mb-3">Usage Instructions</h4>
                <div className="space-y-3">
                  <p className="text-sm text-gray-400">
                    Include your API key in the Authorization header of your requests:
                  </p>
                  <div className="p-3 bg-[#1a1a1a] rounded-lg font-mono text-sm text-gray-400">
                    Authorization: Bearer YOUR_API_KEY
                  </div>
                  <p className="text-sm text-gray-400">
                    For more information, check out our{' '}
                    <a href="#" className="text-blue-500 hover:underline">
                      API documentation
                    </a>
                    .
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-[#0a0a0a] border border-gray-800 rounded-lg">
              <p className="text-gray-400">You don't have permission to manage API keys.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderUrls = () => (
    <>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">URL Management</h2>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setViewMode(current => current === 'grid' ? 'list' : 'grid')}
            className="p-2 rounded-lg hover:bg-gray-800 transition-colors"
            title="Toggle view mode (Ctrl/Cmd + V)"
          >
            {viewMode === 'grid' ? (
              <ListBulletIcon className="w-5 h-5 text-gray-400" />
            ) : (
              <GridIcon className="w-5 h-5 text-gray-400" />
            )}
          </button>
          {showUrlManagement && (
            <button
              onClick={() => handleRestrictedAction(() => setIsAddUrlOpen(true))}
              className="px-4 py-2 rounded text-sm bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition-colors"
            >
              Add URL
            </button>
          )}
        </div>
      </div>

      {isAddUrlOpen && showUrlManagement && (
        <div className="mb-6 bg-[#1a1a1a] border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-200">Add New URL</h3>
            <button
              onClick={() => {
                setIsAddUrlOpen(false);
                setError('');
                setNewUrl({ short_path: '', redirect_url: '' });
              }}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <Cross2Icon className="w-5 h-5 text-gray-400" />
            </button>
          </div>
          <form onSubmit={handleInlineAddUrlSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Short Path
              </label>
              <input
                type="text"
                id="short_path"
                name="short_path"
                className="w-full p-2 rounded-lg bg-[#0a0a0a] border border-gray-800 text-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                placeholder="Enter short path"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Redirect URL
              </label>
              <input
                type="url"
                id="redirect_url"
                name="redirect_url"
                className="w-full p-2 rounded-lg bg-[#0a0a0a] border border-gray-800 text-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                placeholder="Enter redirect URL"
                required
              />
            </div>
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-sm text-red-500">{error}</p>
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsAddUrlOpen(false);
                  setError('');
                  setNewUrl({ short_path: '', redirect_url: '' });
                }}
                className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg text-sm bg-blue-500 text-white hover:bg-blue-600 transition-colors flex items-center gap-2"
              >
                <PlusIcon className="w-4 h-4" />
                Add URL
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex-1">
          <div className="relative">
            <input
              type="text"
              id="url-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              placeholder="Search URLs... (Ctrl/Cmd + K)"
              className="w-full p-2 pl-10 rounded-lg bg-[#1a1a1a] border border-gray-800 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-gray-700"
            />
            <MagnifyingGlassIcon className="w-5 h-5 text-gray-500 absolute left-3 top-1/2 transform -translate-y-1/2" />
            {search && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-800 rounded transition-colors"
              >
                <Cross2Icon className="w-4 h-4 text-gray-500" />
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2 rounded-lg border border-gray-800 transition-colors ${
              showFilters ? 'bg-gray-800 text-gray-200' : 'text-gray-400 hover:bg-gray-800/50'
            }`}
          >
            <MixerHorizontalIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="mb-6 p-4 bg-[#1a1a1a] border border-gray-800 rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-300">Sort & Filter</h3>
            <button
              onClick={() => setShowFilters(false)}
              className="p-1 hover:bg-gray-800 rounded transition-colors"
            >
              <Cross2Icon className="w-4 h-4 text-gray-400" />
            </button>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[120px]">
              <label className="block text-sm text-gray-400 mb-2">Filter By</label>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full p-2 rounded-lg bg-[#0a0a0a] border border-gray-800 text-gray-300 focus:outline-none focus:border-gray-700"
              >
                <option value="all">All URLs</option>
                <option value="active">Active URLs</option>
                {(isAdmin || isOwner) && (
                  <option value="deprecated">Deprecated URLs</option>
                )}
                <option value="favorites">Favorite URLs</option>
              </select>
            </div>
            <div className="flex-1 min-w-[120px]">
              <label className="block text-sm text-gray-400 mb-2">Sort By</label>
              <select
                value={sortConfig.key}
                onChange={(e) => handleSort(e.target.value)}
                className="w-full p-2 rounded-lg bg-[#0a0a0a] border border-gray-800 text-gray-300 focus:outline-none focus:border-gray-700"
              >
                <option value="short_path">Short Path</option>
                <option value="redirect_url">Redirect URL</option>
                <option value="favorites">Favorites</option>
              </select>
            </div>
            <div className="flex-1 min-w-[120px]">
              <label className="block text-sm text-gray-400 mb-2">Sort Direction</label>
              <button
                onClick={() => setSortConfig(prev => ({ ...prev, direction: prev.direction === 'asc' ? 'desc' : 'asc' }))}
                className="w-full p-2 rounded-lg bg-[#0a0a0a] border border-gray-800 text-gray-300 hover:bg-gray-800 transition-colors flex items-center justify-between"
              >
                <span>{sortConfig.direction === 'asc' ? 'Ascending' : 'Descending'}</span>
                {sortConfig.direction === 'asc' ? (
                  <ChevronUpIcon className="w-4 h-4" />
                ) : (
                  <ChevronDownIcon className="w-4 h-4" />
                )}
              </button>
            </div>
            {favorites.size > 0 && (
              <div className="ml-auto">
                <button
                  onClick={clearAllFavorites}
                  className="px-4 py-2 rounded-lg text-sm bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors flex items-center gap-2"
                >
                  <Cross2Icon className="w-4 h-4" />
                  Clear All Favorites
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className={`grid gap-4 ${viewMode === 'grid' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : ''}`}>
        {filteredUrls.map((url) => (
          <div
            key={url.short_path}
            className={`border border-gray-800 rounded-lg transition-all duration-200 hover:border-gray-700 ${
              viewMode === 'list' ? 'flex items-center justify-between p-4' : 'p-4'
            }`}
          >
            {viewMode === 'list' ? (
              <>
                <div className="flex-1 pr-4">
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-sm">/{url.short_path}</p>
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
                    onClick={() => handleCopyUrl(url.short_path)}
                    className="p-2 text-gray-400 hover:text-gray-300 transition-colors"
                    title="Copy URL"
                  >
                    {copiedUrl === url.short_path ? (
                      <CheckIcon className="w-4 h-4" />
                    ) : (
                      <CopyIcon className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => toggleFavorite(url.short_path)}
                    className="p-2 text-gray-400 hover:text-yellow-500 transition-colors"
                    title="Toggle favorite (Ctrl/Cmd + F)"
                  >
                    {favorites.has(url.short_path) ? (
                      <StarFilledIcon className="w-4 h-4 text-yellow-500" />
                    ) : (
                      <StarIcon className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => handleRestrictedAction(() => {
                      setUrlToEdit(url);
                      setShowEditDialog(true);
                    })}
                    className="p-2 text-gray-400 hover:text-blue-500 transition-colors"
                    title="Edit URL"
                  >
                    <Pencil1Icon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleToggleDeprecated(url)}
                    disabled={loadingStates.deprecating.has(url.short_path)}
                    className={`p-2 transition-colors ${
                      url.deprecated 
                        ? 'text-yellow-500 hover:text-yellow-400' 
                        : 'text-green-500 hover:text-green-400'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    title={url.deprecated ? 'Activate URL' : 'Deprecate URL'}
                  >
                    {loadingStates.deprecating.has(url.short_path) ? (
                      <LoadingSpinner />
                    ) : (
                      <GlobeIcon className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => handleDelete(url)}
                    disabled={loadingStates.deleting === url.short_path}
                    className="p-2 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Delete URL"
                  >
                    {loadingStates.deleting === url.short_path ? (
                      <LoadingSpinner />
                    ) : (
                      <TrashIcon className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-sm">/{url.short_path}</p>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      url.deprecated 
                        ? 'bg-red-500/10 text-red-500' 
                        : 'bg-green-500/10 text-green-500'
                    }`}>
                      {url.deprecated ? 'Deprecated' : 'Active'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleCopyUrl(url.short_path)}
                      className="p-1.5 text-gray-400 hover:text-gray-300 transition-colors"
                      title="Copy URL"
                    >
                      {copiedUrl === url.short_path ? (
                        <CheckIcon className="w-4 h-4" />
                      ) : (
                        <CopyIcon className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => toggleFavorite(url.short_path)}
                      className="p-1.5 text-gray-400 hover:text-yellow-500 transition-colors"
                      title="Toggle favorite (Ctrl/Cmd + F)"
                    >
                      {favorites.has(url.short_path) ? (
                        <StarFilledIcon className="w-4 h-4 text-yellow-500" />
                      ) : (
                        <StarIcon className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
                <p className="text-gray-400 text-sm break-all">
                  {url.redirect_url}
                </p>
                <div className="flex items-center gap-2 pt-2 border-t border-gray-800">
                  <button
                    onClick={() => handleRestrictedAction(() => {
                      setUrlToEdit(url);
                      setShowEditDialog(true);
                    })}
                    className="flex-1 px-3 py-1.5 rounded text-sm bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleToggleDeprecated(url)}
                    disabled={loadingStates.deprecating.has(url.short_path)}
                    className={`flex-1 px-3 py-1.5 rounded text-sm inline-flex items-center justify-center gap-2 ${
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
                    className="flex-1 px-3 py-1.5 rounded text-sm inline-flex items-center justify-center gap-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
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

      {showEditDialog && urlToEdit && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <h2 className="text-xl font-semibold text-gray-200">Edit URL</h2>
              <button
                onClick={() => {
                  setShowEditDialog(false);
                  setUrlToEdit(null);
                }}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <Cross2Icon className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="p-6">
              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                handleEdit({
                  short_path: urlToEdit.short_path,
                  redirect_url: formData.get('redirect_url')
                });
                setShowEditDialog(false);
              }} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Short Path
                  </label>
                  <input
                    type="text"
                    value={urlToEdit.short_path}
                    disabled
                    className="w-full p-2 rounded-lg bg-[#0a0a0a] border border-gray-800 text-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Redirect URL
                  </label>
                  <input
                    type="url"
                    name="redirect_url"
                    defaultValue={urlToEdit.redirect_url}
                    className="w-full p-2 rounded-lg bg-[#0a0a0a] border border-gray-800 text-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                    required
                  />
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditDialog(false);
                      setUrlToEdit(null);
                    }}
                    className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg text-sm bg-blue-500 text-white hover:bg-blue-600 transition-colors flex items-center gap-2"
                  >
                    <CheckIcon className="w-4 h-4" />
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (status === 'loading') {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <button 
          onClick={() => signIn('github')} 
          className="bg-blue-500/10 text-blue-500 px-6 py-3 rounded-lg hover:bg-blue-500/20 transition-colors"
        >
          Sign in with GitHub
        </button>
      </div>
    );
  }

  const filteredUrls = urls
    .sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];

      // Special handling for 'favorites' sort
      if (sortConfig.key === 'favorites') {
        const aIsFavorite = favorites.has(a.short_path);
        const bIsFavorite = favorites.has(b.short_path);

        if (aIsFavorite && !bIsFavorite) return -1 * (sortConfig.direction === 'asc' ? 1 : -1);
        if (!aIsFavorite && bIsFavorite) return 1 * (sortConfig.direction === 'asc' ? 1 : -1);
      }

      // Default string comparison for other keys
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortConfig.direction === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }
      return 0; // Fallback for non-string comparisons or equal values
    })
    .filter(url => {
      if (filter === 'deprecated' && !url.deprecated) return false;
      if (filter === 'active' && url.deprecated) return false;
      if (filter === 'favorites' && !favorites.has(url.short_path)) return false;
      
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
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <img 
              src="https://serv.hnz.li/logo/default.png" 
              width={50} 
              height={50} 
              alt="Logo"
              className="rounded"
            />
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          </div>

          {/* User Profile Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowProfileDropdown(!showProfileDropdown)}
              className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-gray-800/50 transition-colors"
            >
              {session?.user?.image && (
                <img src={session.user.image} alt="Profile" className="w-8 h-8 rounded-full" />
              )}
              <span className="text-gray-300">{session?.user?.name}</span>
              <ChevronDownIcon className="w-4 h-4 text-gray-400" />
            </button>

            {showProfileDropdown && (
              <div className="absolute right-0 mt-2 w-48 bg-[#1a1a1a] border border-gray-800 rounded-lg shadow-lg py-1 z-50">
                <div className="px-4 py-2 border-b border-gray-800">
                  <p className="text-sm text-gray-400">Signed in as</p>
                  <p className="text-sm font-medium text-gray-200">{session?.user?.email}</p>
                </div>
                <button
                  onClick={() => signOut()}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
                >
                  <ExitIcon className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Success/Error Message Display */}
        {successMessage && (
          <div className="fixed bottom-4 right-4 z-50 bg-green-500/10 text-green-500 border border-green-500/20 rounded-lg p-3 max-w-sm flex items-center justify-between animate-fade-in-up">
            <p className="text-sm font-medium">{successMessage}</p>
            <button onClick={() => setSuccessMessage('')} className="p-1 -mr-1 rounded-md hover:bg-green-500/20">
              <Cross2Icon className="w-4 h-4" />
            </button>
          </div>
        )}

        {error && (
          <div className="fixed bottom-4 right-4 z-50 bg-red-500/10 text-red-500 border border-red-500/20 rounded-lg p-3 max-w-sm flex items-center justify-between animate-fade-in-up">
            <p className="text-sm font-medium">Error: {error}</p>
            <button onClick={() => setError(null)} className="p-1 -mr-1 rounded-md hover:bg-red-500/20">
              <Cross2Icon className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-4 mb-8 border-b border-gray-800">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'overview'
                ? 'text-blue-500 border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <HomeIcon className="w-4 h-4" />
              Overview
            </div>
          </button>
          <button
            onClick={() => setActiveTab('urls')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'urls'
                ? 'text-blue-500 border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <Link2Icon className="w-4 h-4" />
              URLs
            </div>
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'analytics'
                ? 'text-blue-500 border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <BarChartIcon className="w-4 h-4" />
              Analytics
            </div>
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'settings'
                ? 'text-blue-500 border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <GearIcon className="w-4 h-4" />
              Settings
            </div>
          </button>
        </div>

        {/* Content */}
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'urls' && renderUrls()}
        {activeTab === 'analytics' && (
          <AnalyticsDashboard
            analytics={analytics}
            isLoading={analyticsLoading}
            error={analyticsError}
          />
        )}
        {activeTab === 'settings' && renderSettings()}
      </div>

      {/* Dialogs */}
      <ConfirmDialog
        isOpen={showConfirmDelete}
        onClose={handleCancelDelete}
        onConfirm={confirmDelete}
        title="Confirm Delete"
        message={`Are you sure you want to delete the URL '/${urlToDelete?.short_path}'? This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
      />

      <NoAccessDialog 
        isOpen={showNoAccess} 
        onClose={() => setShowNoAccess(false)} 
      />
    </>
  );
}
