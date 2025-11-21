'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Link2Icon, LockClosedIcon, BarChartIcon, CheckIcon } from '@radix-ui/react-icons';
import { useRole } from '../../hooks/useRole';

const tones = {
  success: 'border-[#4d7a4d] text-[#d5f1d5]',
  danger: 'border-[#8a3b3b] text-[#f1dada]',
  info: 'border-[#3f5f8f] text-[#d6e3f7]',
  neutral: 'border-[#4a4a4a] text-[#dcdcdc]',
};

function Badge({ tone = 'neutral', children }) {
  return (
    <span className={`inline-flex items-center gap-1 border px-2 py-0.5 text-[11px] tracking-tight ${tones[tone] || tones.neutral}`}>
      {children}
    </span>
  );
}

function StatPill({ label, value }) {
  return (
    <div className="border border-[#303030] bg-[#111111] p-3 rounded-sm">
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="text-2xl font-semibold text-[#f0f0f0] mt-1">{value}</p>
    </div>
  );
}

export default function UrlsPage() {
  const { data: session, status } = useSession();
  const { isAdmin, isOwner } = useRole();

  const [urls, setUrls] = useState([]);
  const [filters, setFilters] = useState({ search: '', status: 'all', privacy: 'all' });
  const [loading, setLoading] = useState({ list: false, action: false });
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [newUrl, setNewUrl] = useState({ short_path: '', redirect_url: '', private: false, password: '' });
  const [pendingDelete, setPendingDelete] = useState(null);

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

  const copyText = async (text) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      /* fallback below */
    }
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    } catch {
      return false;
    }
  };

  const loadUrls = async () => {
    setLoading((p) => ({ ...p, list: true }));
    try {
      const data = await fetchJson('/api/admin-urls', {}, 'Failed to load links');
      setUrls(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading((p) => ({ ...p, list: false }));
    }
  };

  useEffect(() => {
    if (isAdmin || isOwner) {
      loadUrls();
    }
  }, [isAdmin, isOwner]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2600);
    return () => clearTimeout(t);
  }, [notice]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setActionError(null);
    if (!newUrl.short_path || !newUrl.redirect_url) {
      setActionError('Short path and destination are required.');
      return;
    }
    setLoading((p) => ({ ...p, action: true }));
    try {
      await fetchJson(
        '/api/admin-urls',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            short_path: newUrl.short_path,
            redirect_url: newUrl.redirect_url,
            private: newUrl.private,
            password: newUrl.private ? newUrl.password || undefined : undefined,
          }),
        },
        'Failed to create link'
      );
      setNewUrl({ short_path: '', redirect_url: '', private: false, password: '' });
      setNotice(`/${newUrl.short_path} created`);
      await loadUrls();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setLoading((p) => ({ ...p, action: false }));
    }
  };

  const handleToggleDeprecated = async (short_path, deprecated) => {
    setActionError(null);
    setLoading((p) => ({ ...p, action: true }));
    try {
      await fetchJson(
        '/api/admin-urls',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ short_path, deprecated }),
        },
        'Failed to update link'
      );
      setNotice(`/${short_path} ${deprecated ? 'deprecated' : 'activated'}`);
      await loadUrls();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setLoading((p) => ({ ...p, action: false }));
    }
  };

  const handleDelete = async (short_path) => {
    setActionError(null);
    setLoading((p) => ({ ...p, action: true }));
    try {
      await fetchJson(
        '/api/admin-urls',
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ short_path }),
        },
        'Failed to delete link'
      );
      setNotice(`/${short_path} deleted`);
      await loadUrls();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setLoading((p) => ({ ...p, action: false }));
    }
  };

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return urls
      .filter((url) => {
        if (filters.status === 'active' && url.deprecated) return false;
        if (filters.status === 'deprecated' && !url.deprecated) return false;
        if (filters.privacy === 'private' && !url.private) return false;
        if (filters.privacy === 'public' && url.private) return false;
        if (!q) return true;
        return url.short_path?.toLowerCase().includes(q) || url.redirect_url?.toLowerCase().includes(q);
      })
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }, [filters, urls]);

  const total = urls.length;
  const activeCount = urls.filter((u) => !u.deprecated).length;
  const privateCount = urls.filter((u) => u.private).length;
  const formatShortPath = (path = '') => {
    if (path.length <= 48) return path;
    return `${path.slice(0, 32)}…${path.slice(-8)}`;
  };

  if (status === 'loading') {
    return <p className="text-slate-400">Checking session...</p>;
  }

  if (!session || (!isAdmin && !isOwner)) {
    return <p className="text-slate-400">No access.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-white flex items-center gap-2">
            <Link2Icon className="w-4 h-4" />
            Links
          </h1>
          <p className="text-sm text-slate-400">Create, browse, and copy short links.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            className="px-3 py-2 rounded-sm border border-[#3a3a3a] bg-[#0f0f0f] text-sm text-[#e6e6e6] focus:border-[#626262] outline-none"
            placeholder="Search links"
            value={filters.search}
            onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
          />
          <select
            value={filters.status}
            onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}
            className="px-3 py-2 rounded-sm border border-[#3a3a3a] bg-[#0f0f0f] text-sm text-[#e6e6e6] focus:border-[#626262] outline-none"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="deprecated">Deprecated</option>
          </select>
          <select
            value={filters.privacy}
            onChange={(e) => setFilters((p) => ({ ...p, privacy: e.target.value }))}
            className="px-3 py-2 rounded-sm border border-[#3a3a3a] bg-[#0f0f0f] text-sm text-[#e6e6e6] focus:border-[#626262] outline-none"
          >
            <option value="all">Any privacy</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
          <button
            onClick={loadUrls}
            className="px-3 py-2 rounded-sm border border-[#3a3a3a] bg-[#1b1b1b] text-sm text-[#e6e6e6] hover:bg-[#242424] transition"
          >
            {loading.list ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatPill label="Total links" value={total} />
        <StatPill label="Active" value={activeCount} />
        <StatPill label="Private" value={privateCount} />
      </div>

      <div className="border border-[#303030] bg-[#111111] p-4 rounded-sm space-y-3">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <LockClosedIcon className="w-4 h-4" />
          Launch a short link
        </h2>
        <form onSubmit={handleCreate} className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs uppercase tracking-[0.16em] text-slate-500">Short path</label>
            <input
              className="w-full rounded-sm border border-[#3a3a3a] bg-[#0f0f0f] px-3 py-2 text-sm text-[#e6e6e6] focus:border-[#626262] outline-none"
              value={newUrl.short_path}
              onChange={(e) => setNewUrl((p) => ({ ...p, short_path: e.target.value }))}
              placeholder="launch-week"
              required
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.16em] text-slate-500">Destination</label>
            <input
              className="w-full rounded-sm border border-[#3a3a3a] bg-[#0f0f0f] px-3 py-2 text-sm text-[#e6e6e6] focus:border-[#626262] outline-none"
              value={newUrl.redirect_url}
              onChange={(e) => setNewUrl((p) => ({ ...p, redirect_url: e.target.value }))}
              placeholder="https://example.com"
              required
            />
          </div>
          <div className="flex items-center gap-2 md:col-span-2">
            <input
              id="private-toggle"
              type="checkbox"
              checked={newUrl.private}
              onChange={(e) => setNewUrl((p) => ({ ...p, private: e.target.checked }))}
              className="rounded-sm border-[#5a5a5a] bg-[#0f0f0f] text-[#f0f0f0] focus:ring-[#626262]"
            />
            <label htmlFor="private-toggle" className="text-sm text-[#e0e0e0] flex items-center gap-2">
              <LockClosedIcon className="w-4 h-4" />
              Require password
            </label>
            <input
              className="flex-1 rounded-sm border border-[#3a3a3a] bg-[#0f0f0f] px-3 py-2 text-sm text-[#e6e6e6] focus:border-[#626262] outline-none"
              value={newUrl.password}
              onChange={(e) => setNewUrl((p) => ({ ...p, password: e.target.value }))}
              placeholder="Password (optional)"
              disabled={!newUrl.private}
            />
            <button
              type="button"
              onClick={() =>
                setNewUrl((p) => ({
                  ...p,
                  private: true,
                  password:
                    p.password ||
                    Array.from({ length: 10 }, () =>
                      'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'.charAt(
                        Math.floor(Math.random() * 58)
                      )
                    ).join(''),
                }))
              }
              className="px-2 py-1 rounded-sm border border-[#3a3a3a] bg-[#1b1b1b] text-xs text-[#f0f0f0] hover:bg-[#222] transition"
            >
              Quick password
            </button>
          </div>
          {actionError && <p className="md:col-span-2 text-sm text-rose-300">{actionError}</p>}
          <div className="md:col-span-2 flex items-center justify-end gap-2">
            <button
              type="submit"
              disabled={loading.action}
              className="px-4 py-2 rounded-sm bg-[#2c2c2c] border border-[#4a4a4a] text-[#f0f0f0] font-medium hover:bg-[#333] transition disabled:opacity-50"
            >
              {loading.action ? 'Saving...' : 'Create link'}
            </button>
          </div>
        </form>
      </div>

      <div className="border border-[#303030] bg-[#111111] rounded-sm">
        {loading.list ? (
          <p className="text-slate-400 text-sm px-4 py-3">Loading links...</p>
        ) : error ? (
          <p className="text-rose-300 text-sm px-4 py-3">{error}</p>
        ) : filtered.length === 0 ? (
          <p className="text-slate-400 text-sm px-4 py-3">No links found.</p>
        ) : (
          <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((url) => (
              <div key={url.short_path} className="rounded-md border border-[#2d2d2d] bg-[#161616] p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Link2Icon className="w-4 h-4 text-blue-300" />
                    <div>
                      <p className="text-white font-semibold flex items-center gap-2 max-w-full" title={`/${url.short_path}`}>
                        <span className="truncate max-w-[220px]">{`/${formatShortPath(url.short_path || '')}`}</span>
                        {url.private && (
                          <Badge tone="info">
                            <LockClosedIcon className="w-3 h-3" /> Private
                          </Badge>
                        )}
                        {url.deprecated && <Badge tone="danger">Deprecated</Badge>}
                      </p>
                      <p className="text-xs text-slate-400">{new Date(url.created_at || '').toLocaleString?.() || '-'}</p>
                    </div>
                  </div>
                  {url.usage_quota && (
                    <Badge tone="neutral">
                      <BarChartIcon className="w-3 h-3" /> Quota {url.usage_quota}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-slate-200 break-words">{url.redirect_url}</p>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <CheckIcon className="w-3 h-3" />
                    {url.deprecated ? 'Inactive' : 'Active'}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        const ok = await copyText(`${window.location.origin}/${url.short_path}`);
                        if (ok) setNotice(`Copied /${url.short_path}`);
                        else setActionError('Clipboard not available in this browser.');
                      }}
                      className="px-2 py-1 rounded-lg border border-slate-800 text-slate-300 hover:text-white"
                    >
                      Copy
                    </button>
                    <button
                      onClick={() => handleToggleDeprecated(url.short_path, !url.deprecated)}
                      className="px-2 py-1 rounded-lg border border-slate-800 text-slate-300 hover:text-white disabled:opacity-60"
                      disabled={loading.action}
                      title="Toggle deprecated"
                    >
                      {url.deprecated ? 'Activate' : 'Deprecate'}
                    </button>
                    <button
                      onClick={() => setPendingDelete(url.short_path)}
                      className="px-2 py-1 rounded-lg border border-rose-500/40 text-rose-200 hover:bg-rose-500/10 disabled:opacity-60"
                      disabled={loading.action}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {pendingDelete && (
        <Dialog onClose={() => setPendingDelete(null)}>
          <div className="space-y-3">
            <p className="text-lg font-semibold text-white">Delete /{pendingDelete}?</p>
            <p className="text-sm text-slate-300">This cannot be undone and clients will stop resolving this link.</p>
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
