'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { BarChartIcon, CheckIcon, ExclamationTriangleIcon, GearIcon, Link2Icon } from '@radix-ui/react-icons';
import { useRole } from '../../hooks/useRole';

const tones = {
  success: 'border-[#4d7a4d] text-[#d5f1d5]',
  danger: 'border-[#8a3b3b] text-[#f1dada]',
  info: 'border-[#3f5f8f] text-[#d6e3f7]',
  neutral: 'border-[#4a4a4a] text-[#dcdcdc]',
};

const rangeOptions = [
  { key: 0, label: 'All time' },
  { key: 7, label: '7d' },
  { key: 30, label: '30d' },
  { key: 90, label: '90d' },
];

function Badge({ tone = 'neutral', children }) {
  return (
    <span
      className={`inline-flex items-center gap-2 border px-2 py-0.5 text-[11px] tracking-tight bg-transparent ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function Card({ title, eyebrow, actions, children }) {
  return (
    <section className="border border-[#303030] bg-[#111111] p-4 text-[#dcdcdc] space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          {eyebrow && <p className="text-[11px] uppercase tracking-[0.16em] text-[#8a8a8a] mb-1">{eyebrow}</p>}
          <h2 className="text-lg font-semibold">{title}</h2>
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const { role, isAdmin, isOwner } = useRole();
  const [analytics, setAnalytics] = useState(null);
  const [timeRange, setTimeRange] = useState(0);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState(null);
  const [loading, setLoading] = useState({ analytics: true });

  const trendLabel = useMemo(() => rangeOptions.find((r) => r.key === timeRange)?.label || 'All time', [timeRange]);

  const visitTrend = useMemo(() => {
    const points = analytics?.visitsOverTime || [];
    if (!points.length) return { delta: 0, percent: 0, series: [] };
    const current = points[points.length - 1]?.count || 0;
    const previous = points[Math.max(0, points.length - 2)]?.count || 0;
    const delta = current - previous;
    const percent = previous ? Math.round((delta / previous) * 100) : current ? 100 : 0;
    return { delta, percent, series: points.map((p) => p.count) };
  }, [analytics]);

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

  const showToast = (message, tone = 'info') => {
    setBanner({ message, tone });
    setTimeout(() => setBanner(null), 2400);
  };

  const loadAnalytics = async (range) => {
    setLoading((p) => ({ ...p, analytics: true }));
    try {
      const data = await fetchJson(`/api/admin-analytics?timeRange=${range}`, {}, 'Failed to load analytics');
      setAnalytics(data);
      setLastRefresh(new Date().toISOString());
      setErrors((p) => ({ ...p, analytics: null }));
    } catch (err) {
      setErrors((p) => ({ ...p, analytics: err.message }));
      showToast(err.message, 'danger');
    } finally {
      setLoading((p) => ({ ...p, analytics: false }));
    }
  };

  useEffect(() => {
    if (isAdmin || isOwner) {
      loadAnalytics(timeRange);
    }
  }, [isAdmin, isOwner, timeRange]);

  const timeAgo = (value) => {
    if (!value) return '';
    const d = new Date(value);
    const diff = Date.now() - d.getTime();
    if (Number.isNaN(diff)) return '';
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const totalVisits = analytics?.totalVisits || 0;
  const activeUrls = analytics?.activeUrls || 0;
  const recentHits = analytics?.recentVisits?.length || 0;

  if (status === 'loading') {
    return (
      <div className="min-h-[40vh] bg-slate-950 text-slate-300 flex items-center justify-center">
        Checking session...
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-[40vh] bg-[#e6e6e6] flex items-center justify-center px-6 rounded-md border border-[#9c9c9c]">
        <div className="text-center space-y-3">
          <p className="text-xs uppercase tracking-[0.2em] text-[#2f2f2f]">Restricted</p>
          <h1 className="text-xl font-semibold text-[#1f1f1f]">Sign in to view analytics</h1>
          <button
            onClick={() => window.location.assign('/api/auth/signin?callbackUrl=/admin/dashboard')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-sm bg-[#d9d9d9] border border-[#7a7a7a] text-[#1f1f1f] font-medium hover:bg-[#cfcfcf] transition"
          >
            <GearIcon />
            Sign in
          </button>
        </div>
      </div>
    );
  }

  if (!isAdmin && !isOwner) {
    return (
      <div className="min-h-[40vh] bg-[#fdf8e3] text-[#1f1f1f] flex items-center justify-center px-6 rounded-md border border-[#b9a12c]">
        <div className="text-center space-y-3">
          <p className="text-xs uppercase tracking-[0.2em] text-[#7c6513]">No Access</p>
          <p>Ask an owner to grant you access in /admin.</p>
          <button
            onClick={() => signOut()}
            className="px-4 py-2 rounded-sm border border-[#7a7a7a] text-[#1f1f1f] bg-[#dedede] hover:bg-[#d2d2d2] transition"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="border border-[#303030] bg-[#151515] p-3 space-y-2 rounded-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <GearIcon className="w-5 h-5 text-[#dcdcdc]" />
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[#8a8a8a]">Admin pulse</p>
              <h1 className="text-xl font-semibold text-[#f0f0f0]">Analytics overview</h1>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 text-sm text-[#b5b5b5]">
            <span>Role: {role || 'viewer'}</span>
            <span>Session: {session?.user?.email || 'unknown'}</span>
            <span className="text-xs text-slate-500">{process.env.NEXT_PUBLIC_ENV || 'Production'}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-1">
          <Badge tone="neutral">
            {lastRefresh ? `Synced ${new Date(lastRefresh).toLocaleTimeString()}` : 'Sync pending'}
          </Badge>
          <Badge tone={visitTrend.delta >= 0 ? 'success' : 'danger'}>
            {visitTrend.delta === 0 ? 'Flat traffic' : `${visitTrend.delta > 0 ? '+' : ''}${visitTrend.delta} vs last period`}
          </Badge>
          <Badge tone="info">{trendLabel} window</Badge>
        </div>
      </header>

      {banner && (
        <div className="fixed bottom-4 right-4 z-40">
          <div className={`flex items-center gap-3 rounded-sm border px-4 py-3 shadow-md bg-[#151515] ${tones[banner.tone] || tones.info}`}>
            <span className="text-sm font-medium text-[#e6e6e6]">{banner.message}</span>
            <button onClick={() => setBanner(null)} className="text-xs text-slate-300 hover:text-white transition">
              Close
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <StatBlock label="Total visits" value={totalVisits.toLocaleString()} detail={`${visitTrend.delta >= 0 ? '+' : ''}${visitTrend.delta} vs last`} icon={<BarChartIcon className="h-6 w-6" />} />
        <StatBlock label="Active URLs" value={activeUrls} detail={`${analytics?.deprecatedUrls || 0} deprecated`} icon={<CheckIcon className="h-6 w-6" />} />
        <StatBlock label="Recent hits" value={recentHits} detail="Last captured window" icon={<Link2Icon className="h-6 w-6" />} />
        <StatBlock label="Sync" value={lastRefresh ? new Date(lastRefresh).toLocaleTimeString() : 'Pending'} detail={trendLabel} icon={<ExclamationTriangleIcon className="h-6 w-6" />} />
      </div>

      <Card
        title="Traffic snapshot"
        eyebrow="Analytics"
        actions={
          <div className="flex items-center gap-2">
            {rangeOptions.map((range) => (
              <button
                key={range.key}
                onClick={() => setTimeRange(range.key)}
                className={`px-3 py-1.5 border text-sm ${
                  timeRange === range.key
                    ? 'border-[#4a4a4a] bg-[#1f1f1f] text-[#f0f0f0]'
                    : 'border-[#2d2d2d] bg-[#0f0f0f] text-[#c4c4c4]'
                }`}
              >
                {range.label}
              </button>
            ))}
            <button
              onClick={() => loadAnalytics(timeRange)}
              className="px-3 py-1.5 border border-[#3a3a3a] bg-[#1b1b1b] text-sm text-[#f0f0f0] hover:bg-[#242424] transition"
            >
              {loading.analytics ? 'Syncing...' : 'Refresh'}
            </button>
          </div>
        }
      >
        {loading.analytics ? (
          <p className="text-slate-400 text-sm">Syncing analytics...</p>
        ) : analytics ? (
          <div className="space-y-4">
            <div className="border border-[#2d2d2d] bg-[#121212] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Traffic window - {trendLabel}</p>
                <p className="text-2xl font-semibold text-white">{analytics.totalVisits || 0} visits</p>
                <p className="text-sm text-slate-400">
                  {visitTrend.delta === 0
                    ? 'Holding steady vs prior data point'
                    : `${visitTrend.delta > 0 ? '+' : ''}${visitTrend.delta} change (${visitTrend.percent}% shift)`}
                </p>
              </div>
              <div className="text-right text-sm text-slate-400">
                {visitTrend.delta >= 0 ? 'Trend up' : 'Trend down'}; latest {visitTrend.series.slice(-1)[0] || 0} hits
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              <MiniTile title="Visits" value={analytics.totalVisits || 0} detail={`Avg ${analytics.averageClicks?.toFixed?.(1) || 0} / link`} />
              <MiniTile title="Active URLs" value={analytics.activeUrls || 0} detail={`${analytics.deprecatedUrls || 0} deprecated`} />
              <MiniTile title="Recent hits" value={analytics.recentVisits?.length || 0} detail="Last 10 captured" />
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-2">Top performers</p>
                <div className="space-y-2">
                  {(analytics.visitStats || []).slice(0, 5).map((row) => (
                    <div
                      key={row.short_path}
                      className="flex items-center justify-between gap-3 border border-[#2d2d2d] bg-[#121212] px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <Link2Icon className="w-4 h-4 text-blue-300" />
                        <span className="text-white font-medium">/{row.short_path}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-300">
                        <BarChartIcon className="w-4 h-4" />
                        {row.count}
                      </div>
                    </div>
                  ))}
                  {(!analytics.visitStats || analytics.visitStats.length === 0) && (
                    <p className="text-slate-400 text-sm">Send traffic to see analytics.</p>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-2">Recent traffic</p>
                <div className="space-y-2">
                  {(analytics.recentVisits || []).map((row, i) => (
                    <div
                      key={`${row.short_path}-${row.visited_at || i}`}
                      className="flex items-center justify-between gap-3 border border-[#2d2d2d] bg-[#121212] px-3 py-2"
                    >
                      <div>
                        <p className="text-white font-medium flex items-center gap-2">
                          /{row.short_path || 'unknown'}
                          {row.environment && <Badge tone="neutral">{row.environment}</Badge>}
                        </p>
                        <p className="text-xs text-slate-400">{timeAgo(row.visited_at)}</p>
                      </div>
                      <div className="text-right text-xs text-slate-400">
                        <p>{row.ip_address || 'anon'}</p>
                        {row.version_number && <p className="text-slate-500">v{row.version_number}</p>}
                      </div>
                    </div>
                  ))}
                  {(!analytics.recentVisits || analytics.recentVisits.length === 0) && (
                    <p className="text-slate-400 text-sm">Quiet right now. Waiting for new visits.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-slate-400 text-sm">{errors.analytics || 'No analytics yet.'}</p>
        )}
      </Card>
    </div>
  );
}

function StatBlock({ label, value, detail, icon }) {
  return (
    <div className="relative border border-[#303030] bg-[#111111] p-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{label}</p>
          <p className="text-3xl font-semibold text-[#f0f0f0] mt-1">{value}</p>
          {detail && <p className="text-sm text-slate-400 mt-1">{detail}</p>}
        </div>
        <div className="p-2 border border-[#3a3a3a] text-[#e6e6e6]">{icon}</div>
      </div>
    </div>
  );
}

function MiniTile({ title, value, detail }) {
  return (
    <div className="border border-[#303030] bg-[#111111] p-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{title}</p>
      <p className="text-2xl font-semibold text-[#f0f0f0] mt-1">{value}</p>
      <p className="text-xs text-slate-400 mt-1">{detail}</p>
    </div>
  );
}
