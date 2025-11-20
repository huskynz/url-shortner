'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { BarChartIcon, Link2Icon } from '@radix-ui/react-icons';
import { useRole } from '../../hooks/useRole';

const tones = {
  success: 'border-[#4d7a4d] text-[#d5f1d5]',
  danger: 'border-[#8a3b3b] text-[#f1dada]',
  info: 'border-[#3f5f8f] text-[#d6e3f7]',
  neutral: 'border-[#4a4a4a] text-[#dcdcdc]',
};

function Badge({ tone = 'neutral', children }) {
  return (
    <span
      className={`inline-flex items-center gap-2 border px-2 py-0.5 text-[11px] tracking-tight bg-transparent ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function Card({ title, eyebrow, children }) {
  return (
    <section className="border border-[#303030] bg-[#111111] p-4 text-[#dcdcdc] space-y-3">
      <div>
        {eyebrow && <p className="text-[11px] uppercase tracking-[0.16em] text-[#8a8a8a] mb-1">{eyebrow}</p>}
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function StatsPage() {
  const { data: session, status } = useSession();
  const { isAdmin, isOwner } = useRole();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState({});

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

  useEffect(() => {
    if (isAdmin || isOwner) {
      (async () => {
        setLoading(true);
        try {
          const data = await fetchJson('/api/admin-analytics', {}, 'Failed to load analytics');
          setAnalytics(data);
          setErrors((p) => ({ ...p, analytics: null }));
        } catch (err) {
          setErrors((p) => ({ ...p, analytics: err.message }));
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [isAdmin, isOwner]);

  const totalVisits = analytics?.totalVisits || 0;

  if (status === 'loading') {
    return <p className="text-slate-400">Checking session...</p>;
  }

  if (!session || (!isAdmin && !isOwner)) {
    return <p className="text-slate-400">No access.</p>;
  }

  return (
    <div className="space-y-4">
      <Card title="Distributions" eyebrow={`Total ${totalVisits.toLocaleString() || 0} visits`}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Distribution title="Browsers" data={analytics?.browserDistribution} total={analytics?.totalVisits} color="bg-blue-500" />
          <Distribution title="Operating systems" data={analytics?.osDistribution} total={analytics?.totalVisits} color="bg-emerald-500" />
        </div>
      </Card>
      <Card title="Top performers" eyebrow="Breakdown">
        {loading ? (
          <p className="text-slate-400 text-sm">Loading...</p>
        ) : (analytics?.visitStats || []).length > 0 ? (
          <div className="space-y-2">
            {(analytics.visitStats || []).slice(0, 10).map((row) => (
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
          </div>
        ) : (
          <p className="text-slate-400 text-sm">{errors.analytics || 'No data yet.'}</p>
        )}
      </Card>
    </div>
  );
}

function Distribution({ title, data = [], total = 0, color }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-2">{title}</p>
      <div className="space-y-1">
        {data?.slice(0, 8).map((item) => (
          <div key={item.name} className="flex items-center gap-2">
            <div className="w-24 text-sm text-[#dcdcdc]">{item.name}</div>
            <div className="flex-1 h-2 bg-[#1f1f1f] overflow-hidden border border-[#3a3a3a]">
              <div
                className={`${color}`}
                style={{ width: `${Math.min(100, total ? (item.count / total) * 100 : 0)}%`, height: '100%' }}
              />
            </div>
            <span className="w-10 text-right text-xs text-slate-400">{item.count}</span>
          </div>
        ))}
        {(!data || data.length === 0) && <p className="text-sm text-slate-400">No data yet.</p>}
      </div>
    </div>
  );
}
