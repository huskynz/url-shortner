import { NextResponse } from 'next/server';
import { validateRequest } from '@/app/lib/authMiddleware';
import supabase, { getCachedData } from '@/app/lib/supabase';

const MAX_ANALYTICS_ROWS = parseInt(process.env.ADMIN_ANALYTICS_MAX_ROWS || '5000', 10);
const ANALYTICS_BATCH_SIZE = parseInt(process.env.ADMIN_ANALYTICS_BATCH_SIZE || '1000', 10);

function applyTimeRange(query, timeRange, cutoffIso) {
  if (timeRange > 0) {
    return query.gte('visited_at', cutoffIso);
  }
  return query;
}

function aggregateCounts(rows, key, { resultKey = 'name', fallbackLabel = 'Unknown' } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  const counts = rows.reduce((acc, row) => {
    const value = row[key] ?? fallbackLabel;
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts)
    .map(([value, count]) => ({ [resultKey]: value, count }))
    .sort((a, b) => b.count - a.count);
}

function aggregateVisitsOverTime(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  const counts = rows.reduce((acc, row) => {
    if (!row.visited_at) {
      return acc;
    }
    const dateKey = row.visited_at.slice(0, 10);
    acc[dateKey] = (acc[dateKey] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => (a.date > b.date ? 1 : -1));
}

async function fetchVisitAnalyticsRows(timeRange, cutoffIso) {
  const rows = [];
  let offset = 0;

  while (rows.length < MAX_ANALYTICS_ROWS) {
    const rangeEnd = Math.min(offset + ANALYTICS_BATCH_SIZE - 1, MAX_ANALYTICS_ROWS - 1);
    let query = supabase
      .from('visits')
      .select('short_path, browser, os, visited_at')
      .order('visited_at', { ascending: false })
      .range(offset, rangeEnd);

    query = applyTimeRange(query, timeRange, cutoffIso);

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      break;
    }

    rows.push(...data);

    if (data.length < ANALYTICS_BATCH_SIZE) {
      break;
    }

    offset += ANALYTICS_BATCH_SIZE;
  }

  return rows;
}

export async function GET(req) {
  try {
    if (!await validateRequest(req)) {
      console.warn('Unauthorized access attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const timeRange = parseInt(searchParams.get('timeRange') || '0', 10);

    const analyticsData = await getCachedData(`analytics_${timeRange}`, async () => {
      const cutoffDate = new Date();
      if (timeRange > 0) {
        cutoffDate.setDate(cutoffDate.getDate() - timeRange);
      }
      const cutoffIso = cutoffDate.toISOString();

      const [
        totalUrlsResult,
        totalVisitsResult,
        recentVisitsResult,
        visitRows,
        urlsResult,
      ] = await Promise.all([
        supabase
          .from(process.env.SUPABASE_DB_NAME)
          .select('*', { count: 'exact', head: true }),
        applyTimeRange(
          supabase.from('visits').select('*', { count: 'exact', head: true }),
          timeRange,
          cutoffIso
        ),
        applyTimeRange(
          supabase
            .from('visits')
            .select('short_path, user_agent, ip_address, environment, version_number, visited_at, user_id')
            .order('visited_at', { ascending: false })
            .limit(10),
          timeRange,
          cutoffIso
        ),
        fetchVisitAnalyticsRows(timeRange, cutoffIso),
        supabase
          .from(process.env.SUPABASE_DB_NAME)
          .select('deprecated')
      ]);

      const { count: totalUrls, error: urlError } = totalUrlsResult;
      const { count: totalVisits, error: visitError } = totalVisitsResult;
      const { data: recentVisits, error: recentError } = recentVisitsResult;
      const { data: urls, error: urlsDataError } = urlsResult;

      if (urlError) throw urlError;
      if (visitError) throw visitError;
      if (recentError) throw recentError;
      if (urlsDataError) throw urlsDataError;

      const visitStats = aggregateCounts(visitRows, 'short_path', { resultKey: 'short_path' });
      const normalizedBrowsers = aggregateCounts(visitRows, 'browser');
      const normalizedOs = aggregateCounts(visitRows, 'os');
      const visitsOverTime = aggregateVisitsOverTime(visitRows);

      return {
        totalUrls,
        totalVisits,
        activeUrls: totalUrls - (urls?.filter(u => u.deprecated)?.length || 0),
        deprecatedUrls: urls?.filter(u => u.deprecated)?.length || 0,
        averageClicks: totalVisits / (totalUrls || 1),
        visitStats,
        recentVisits: recentVisits || [],
        browserDistribution: normalizedBrowsers,
        osDistribution: normalizedOs,
        visitsOverTime,
      };
    }, 30000);

    return NextResponse.json(analyticsData);
  } catch (error) {
    console.error('Error in GET /api/admin-analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics data' },
      { status: 500 }
    );
  }
}
