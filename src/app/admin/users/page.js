'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRole } from '../../hooks/useRole';
import { LockClosedIcon, CheckIcon, MagnifyingGlassIcon, CopyIcon, ReloadIcon } from '@radix-ui/react-icons';

const roles = ['viewer', 'admin', 'owner'];

function Badge({ tone = 'neutral', children }) {
  const tones = {
    success: 'border-[#4d7a4d] text-[#d5f1d5]',
    danger: 'border-[#8a3b3b] text-[#f1dada]',
    info: 'border-[#3f5f8f] text-[#d6e3f7]',
    neutral: 'border-[#4a4a4a] text-[#dcdcdc]',
  };
  return (
    <span className={`inline-flex items-center gap-1 border px-2 py-0.5 text-[11px] tracking-tight ${tones[tone] || tones.neutral}`}>
      {children}
    </span>
  );
}

export default function UsersPage() {
  const { data: session, status } = useSession();
  const { isOwner, isAdmin } = useRole();
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState({ list: true, action: false });
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [newUser, setNewUser] = useState({ email: '', password: '', role: 'admin' });
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [roleDrafts, setRoleDrafts] = useState({});
  const [copiedEmail, setCopiedEmail] = useState(null);
  const [resetDialog, setResetDialog] = useState({
    open: false,
    email: '',
    password: '',
    error: null,
    saving: false,
  });

  const fetchJson = async (url, options = {}, fallback = 'Request failed') => {
    const res = await fetch(url, options);
    let data;
    try {
      data = await res.json();
    } catch {
      data = {};
    }
    if (!res.ok || data?.error) {
      throw new Error(data?.error || fallback);
    }
    return data;
  };

  const loadAdmins = async () => {
    setLoading((p) => ({ ...p, list: true }));
    try {
      const data = await fetchJson('/api/admin-management', {}, 'Failed to load users');
      setAdmins(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading((p) => ({ ...p, list: false }));
    }
  };

  useEffect(() => {
    if (isAdmin || isOwner) {
      loadAdmins();
    }
  }, [isAdmin, isOwner]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2600);
    return () => clearTimeout(t);
  }, [notice]);

  const generatePassword = () =>
    Array.from({ length: 14 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*?'.charAt(Math.floor(Math.random() * 60))).join('');

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newUser.email || !newUser.password) {
      setActionError('Email and password are required.');
      return;
    }
    setActionError(null);
    setLoading((p) => ({ ...p, action: true }));
    try {
      await fetchJson(
        '/api/auth/signup',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newUser),
        },
        'Failed to create user'
      );
      setNewUser({ email: '', password: '', role: 'admin' });
      setNotice('User created');
      await loadAdmins();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setLoading((p) => ({ ...p, action: false }));
    }
  };

  const handleRoleChange = async (email, nextRole) => {
    setActionError(null);
    setLoading((p) => ({ ...p, action: true }));
    try {
      await fetchJson(
        '/api/admin-management',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, role: nextRole }),
        },
        'Failed to update role'
      );
      setNotice(`Updated ${email}`);
      await loadAdmins();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setLoading((p) => ({ ...p, action: false }));
    }
  };

  const handleDelete = async (email) => {
    setActionError(null);
    setLoading((p) => ({ ...p, action: true }));
    try {
      await fetchJson(
        '/api/admin-management',
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        },
        'Failed to delete user'
      );
      setNotice(`Removed ${email}`);
      await loadAdmins();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setLoading((p) => ({ ...p, action: false }));
    }
  };

  const handleResetPassword = async () => {
    if (!resetDialog.email || !resetDialog.password) {
      setResetDialog((p) => ({ ...p, error: 'Email and password are required' }));
      return;
    }
    setResetDialog((p) => ({ ...p, saving: true, error: null }));
    try {
      await fetchJson(
        '/api/admin-management',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: resetDialog.email, password: resetDialog.password }),
        },
        'Failed to reset password'
      );
      setNotice(`Password reset for ${resetDialog.email}`);
      setResetDialog((p) => ({ ...p, saving: false, open: false }));
    } catch (err) {
      setResetDialog((p) => ({ ...p, error: err.message, saving: false }));
    }
  };

  const filteredAdmins = useMemo(() => {
    const term = search.trim().toLowerCase();
    const roleScoped = roleFilter === 'all' ? admins : admins.filter((a) => (a.role || 'viewer') === roleFilter);
    const searched = term
      ? roleScoped.filter((a) => a.email.toLowerCase().includes(term) || (a.role || 'viewer').toLowerCase().includes(term))
      : roleScoped;
    const priority = { owner: 0, admin: 1, viewer: 2 };
    return [...searched].sort((a, b) => {
      const aRole = a.role || 'viewer';
      const bRole = b.role || 'viewer';
      const roleCompare = (priority[aRole] ?? 99) - (priority[bRole] ?? 99);
      if (roleCompare !== 0) return roleCompare;
      return a.email.localeCompare(b.email);
    });
  }, [admins, roleFilter, search]);

  useEffect(() => {
    // Reset any staged role changes when the list updates
    setRoleDrafts({});
  }, [admins]);

  if (status === 'loading') return <p className="text-slate-400">Checking session...</p>;
  if (!session || (!isAdmin && !isOwner)) return <p className="text-slate-400">No access.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-white flex items-center gap-2">
            <LockClosedIcon className="w-4 h-4" />
            User management
          </h1>
          <p className="text-sm text-slate-400">Manage admin/owner accounts for RBAC.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadAdmins()}
            disabled={loading.list}
            className="inline-flex items-center gap-2 rounded-sm border border-[#3a3a3a] bg-[#1b1b1b] px-3 py-2 text-sm text-[#e6e6e6] hover:bg-[#222] transition disabled:opacity-50"
          >
            <ReloadIcon className="w-3 h-3" />
            Refresh
          </button>
        </div>
      </div>

      <div className={`grid gap-6 ${isOwner ? 'lg:grid-cols-[360px_1fr] xl:grid-cols-[400px_1fr]' : ''}`}>
        {isOwner && (
          <div className="space-y-4">
            <div className="border border-[#303030] bg-[#111111] p-4 rounded-sm space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Invite user</h2>
                <Badge tone="info">Owner only</Badge>
              </div>
              <form onSubmit={handleCreate} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs uppercase tracking-[0.16em] text-slate-500">Email</label>
                  <input
                    className="w-full rounded-sm border border-[#3a3a3a] bg-[#0f0f0f] px-3 py-2 text-sm text-[#e6e6e6] focus:border-[#626262] outline-none"
                    value={newUser.email}
                    onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))}
                    type="email"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs uppercase tracking-[0.16em] text-slate-500">Temporary password</label>
                  <div className="flex gap-2">
                    <input
                      className="w-full rounded-sm border border-[#3a3a3a] bg-[#0f0f0f] px-3 py-2 text-sm text-[#e6e6e6] focus:border-[#626262] outline-none"
                      value={newUser.password}
                      onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))}
                      type="text"
                      required
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setNewUser((p) => ({
                          ...p,
                          password: Array.from({ length: 12 }, () =>
                            'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'.charAt(Math.floor(Math.random() * 58))
                          ).join(''),
                        }))
                      }
                      className="px-3 py-2 rounded-sm border border-[#3a3a3a] bg-[#1b1b1b] text-xs text-[#f0f0f0] hover:bg-[#222] transition"
                    >
                      Generate
                    </button>
                  </div>
                  <p className="text-xs text-slate-500">Share once; user should set their own password after login.</p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs uppercase tracking-[0.16em] text-slate-500">Role</label>
                  <div className="inline-flex items-center gap-1 rounded-sm border border-[#2d2d2d] bg-[#0f0f0f] p-1">
                    {roles.map((r) => {
                      const active = newUser.role === r;
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setNewUser((p) => ({ ...p, role: r }))}
                          className={`px-2 py-1 rounded-sm text-xs capitalize transition ${
                            active
                              ? 'bg-[#1f1f1f] border border-[#4a4a4a] text-white'
                              : 'border border-transparent text-slate-300 hover:bg-[#171717]'
                          }`}
                        >
                          {r}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {actionError && <p className="text-sm text-rose-300">{actionError}</p>}
                <div className="flex items-center justify-end">
                  <button
                    type="submit"
                    disabled={loading.action}
                    className="px-4 py-2 rounded-sm bg-[#2c2c2c] border border-[#4a4a4a] text-[#f0f0f0] font-medium hover:bg-[#333] transition disabled:opacity-50"
                  >
                    {loading.action ? 'Creating...' : 'Create user'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="border border-[#303030] bg-[#111111] p-4 rounded-sm space-y-3">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold text-white">Users</h2>
                  <p className="text-sm text-slate-400">Search, filter, and update access quickly.</p>
                </div>
                {actionError && <p className="text-sm text-rose-300">{actionError}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[220px] max-w-sm">
                  <MagnifyingGlassIcon className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by email or role"
                    className="w-full pl-8 pr-3 py-2 rounded-sm border border-[#3a3a3a] bg-[#0f0f0f] text-sm text-[#e6e6e6] focus:border-[#626262] outline-none"
                  />
                </div>
                <div className="inline-flex items-center gap-1 rounded-sm border border-[#2d2d2d] bg-[#0f0f0f] p-1">
                  {['all', ...roles].map((r) => {
                    const active = roleFilter === r;
                    return (
                      <button
                        key={r}
                        onClick={() => setRoleFilter(r)}
                        className={`px-2 py-1 rounded-sm text-xs capitalize transition ${
                          active
                            ? 'bg-[#1f1f1f] border border-[#4a4a4a] text-white'
                            : 'border border-transparent text-slate-300 hover:bg-[#171717]'
                        }`}
                      >
                        {r}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {loading.list ? (
              <p className="text-slate-400 text-sm">Loading users...</p>
            ) : error ? (
              <p className="text-rose-300 text-sm">{error}</p>
            ) : filteredAdmins.length === 0 ? (
              <p className="text-slate-400 text-sm">No users.</p>
            ) : (
              <div className="overflow-hidden rounded-sm border border-[#2d2d2d] bg-[#161616]">
                <div className="hidden md:grid grid-cols-[1.8fr_1fr_1.4fr] gap-2 px-3 py-2 text-xs uppercase tracking-[0.16em] text-slate-500 border-b border-[#2d2d2d]">
                  <span>Email</span>
                  <span>Role</span>
                  <span className="text-right pr-2">Actions</span>
                </div>
                <div className="divide-y divide-[#2d2d2d]">
                  {filteredAdmins.map((admin) => {
                    const currentRole = admin.role || 'viewer';
                    const stagedRole = roleDrafts[admin.email] ?? currentRole;
                    const changed = stagedRole !== currentRole;
                    return (
                      <div
                        key={admin.email}
                        className="grid md:grid-cols-[1.8fr_1fr_1.4fr] gap-3 px-3 py-3 items-center"
                      >
                        <div className="space-y-1">
                          <p className="text-white font-semibold break-all">{admin.email}</p>
                          <p className="text-xs text-slate-500 capitalize">Current: {currentRole}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge tone={currentRole === 'owner' ? 'info' : currentRole === 'admin' ? 'success' : 'neutral'}>
                            {currentRole}
                          </Badge>
                          {isOwner && (
                            <div className="flex items-center gap-1">
                              {roles.map((r) => {
                                const active = stagedRole === r;
                                return (
                                  <button
                                    key={r}
                                    onClick={() => setRoleDrafts((prev) => ({ ...prev, [admin.email]: r }))}
                                    disabled={loading.action}
                                    className={`px-2 py-1 rounded-sm border text-xs capitalize transition ${
                                      active
                                        ? 'border-[#4a4a4a] bg-[#1f1f1f] text-white'
                                        : 'border-[#2d2d2d] bg-[#0f0f0f] text-slate-300 hover:bg-[#171717]'
                                    }`}
                                  >
                                    {r}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center justify-start md:justify-end gap-2">
                          <button
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(admin.email);
                                setCopiedEmail(admin.email);
                                setTimeout(() => setCopiedEmail(null), 1800);
                                setNotice(`Copied ${admin.email}`);
                              } catch {
                                setNotice('Failed to copy email');
                              }
                            }}
                            className="inline-flex items-center gap-1 px-3 py-2 rounded-sm border border-[#3a3a3a] bg-[#1b1b1b] text-xs text-[#e6e6e6] hover:bg-[#222] transition"
                          >
                            <CopyIcon className="w-3 h-3" />
                            {copiedEmail === admin.email ? 'Copied' : 'Copy'}
                          </button>
                          {isOwner && (
                            <>
                              <button
                                onClick={() => handleRoleChange(admin.email, stagedRole)}
                                disabled={!changed || loading.action}
                                className="inline-flex items-center gap-2 px-3 py-2 rounded-sm border border-[#4a4a4a] bg-[#1f1f1f] text-xs text-[#e6e6e6] hover:bg-[#262626] transition disabled:opacity-50"
                              >
                                <CheckIcon className="w-3 h-3" />
                                {loading.action && changed ? 'Updating...' : changed ? 'Update role' : 'Up to date'}
                              </button>
                              <button
                                onClick={() =>
                                  setResetDialog({
                                    open: true,
                                    email: admin.email,
                                    password: generatePassword(),
                                    error: null,
                                    saving: false,
                                  })
                                }
                                className="inline-flex items-center gap-2 px-3 py-2 rounded-sm border border-[#3a3a3a] bg-[#1b1b1b] text-xs text-[#e6e6e6] hover:bg-[#222] transition disabled:opacity-50"
                                disabled={loading.action}
                              >
                                Reset password
                              </button>
                              <button
                                onClick={() => setPendingDelete(admin.email)}
                                className="px-3 py-2 rounded-sm border border-rose-500/40 text-rose-200 hover:bg-rose-500/10 disabled:opacity-60 text-xs"
                                disabled={loading.action}
                              >
                                Remove
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {pendingDelete && (
        <Dialog onClose={() => setPendingDelete(null)}>
          <div className="space-y-3">
            <p className="text-lg font-semibold text-white">Remove {pendingDelete}?</p>
            <p className="text-sm text-slate-300">This user will lose access immediately.</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPendingDelete(null)}
                className="px-3 py-2 rounded-sm border border-[#3a3a3a] bg-[#1b1b1b] text-sm text-[#e6e6e6] hover:bg-[#242424] transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleDelete(pendingDelete);
                  setPendingDelete(null);
                }}
                className="px-3 py-2 rounded-sm border border-rose-500/60 bg-rose-500/10 text-sm text-rose-100 hover:bg-rose-500/20 transition disabled:opacity-60"
                disabled={loading.action}
              >
                Delete
              </button>
            </div>
          </div>
        </Dialog>
      )}

      {notice && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-sm border border-[#3a3a3a] bg-[#1b1b1b] px-3 py-2 text-sm text-[#e6e6e6] shadow-lg">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="text-xs text-slate-400 hover:text-white transition">
            Close
          </button>
        </div>
      )}

      {resetDialog.open && (
        <Dialog onClose={() => setResetDialog((p) => ({ ...p, open: false }))}>
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-lg font-semibold text-white">Reset password</p>
              <p className="text-sm text-slate-300 break-all">{resetDialog.email}</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-[0.16em] text-slate-500">Temporary password</label>
              <div className="flex gap-2">
                <input
                  value={resetDialog.password}
                  onChange={(e) => setResetDialog((p) => ({ ...p, password: e.target.value }))}
                  className="w-full rounded-sm border border-[#3a3a3a] bg-[#0f0f0f] px-3 py-2 text-sm text-[#e6e6e6] focus:border-[#626262] outline-none"
                />
                <button
                  type="button"
                  onClick={() => setResetDialog((p) => ({ ...p, password: generatePassword() }))}
                  className="px-3 py-2 rounded-sm border border-[#3a3a3a] bg-[#1b1b1b] text-xs text-[#f0f0f0] hover:bg-[#222] transition"
                >
                  Shuffle
                </button>
              </div>
              <p className="text-xs text-slate-500">Share this with the user; they should log in and set a new one.</p>
            </div>
            {resetDialog.error && <p className="text-sm text-rose-300">{resetDialog.error}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setResetDialog((p) => ({ ...p, open: false }))}
                className="px-3 py-2 rounded-sm border border-[#3a3a3a] bg-[#1b1b1b] text-sm text-[#e6e6e6] hover:bg-[#242424] transition"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(resetDialog.password);
                    setNotice('Password copied');
                  } catch {
                    // ignore copy failure
                  }
                  handleResetPassword();
                }}
                disabled={resetDialog.saving}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-sm border border-[#4a4a4a] bg-[#1f1f1f] text-sm text-[#e6e6e6] hover:bg-[#262626] transition disabled:opacity-50"
              >
                {resetDialog.saving ? 'Saving...' : 'Copy & Save'}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function Dialog({ children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-md border border-[#3a3a3a] bg-[#141414] p-4 text-[#e6e6e6] shadow-lg rounded-sm">
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-2 py-1 text-xs text-slate-400 hover:text-white border border-[#3a3a3a] bg-[#1b1b1b]"
          >
            Close
          </button>
        </div>
        <div className="mt-2">{children}</div>
      </div>
    </div>
  );
}
