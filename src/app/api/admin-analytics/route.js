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
  try {
    const rows = [];
    let offset = 0;
    let retries = 0;
    const maxRetries = 2;

    while (rows.length < MAX_ANALYTICS_ROWS && retries <= maxRetries) {
      const rangeEnd = Math.min(offset + ANALYTICS_BATCH_SIZE - 1, MAX_ANALYTICS_ROWS - 1);
      let query = supabase
        .from('visits')
        .select('short_path, browser, os, visited_at')
        .order('visited_at', { ascending: false })
        .range(offset, rangeEnd);

      query = applyTimeRange(query, timeRange, cutoffIso);

      const { data, error } = await query;
      
      if (error) {
        console.error(`Error fetching visit analytics batch at offset ${offset}:`, error);
        retries++;
        if (retries > maxRetries) {
          // Return what we have so far instead of failing completely
          console.warn(`Max retries reached, returning ${rows.length} rows`);
          break;
        }
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 100 * retries));
        continue;
      }

      if (!data || data.length === 0) {
        break;
      }

      rows.push(...data);

      if (data.length < ANALYTICS_BATCH_SIZE) {
        break;
      }

      offset += ANALYTICS_BATCH_SIZE;
      retries = 0; // Reset retries on successful fetch
    }

    return rows;
  } catch (err) {
    console.error('Fatal error in fetchVisitAnalyticsRows:', err);
    // Return empty array as fallback rather than crashing the whole endpoint
    return [];
  }
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
      ] = await Promise.allSettled([
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

      // Extract results with fallbacks
      const totalUrls = totalUrlsResult.status === 'fulfilled' ? totalUrlsResult.value.count || 0 : 0;
      const totalVisits = totalVisitsResult.status === 'fulfilled' ? totalVisitsResult.value.count || 0 : 0;
      const recentVisits = recentVisitsResult.status === 'fulfilled' ? recentVisitsResult.value.data || [] : [];
      const visitRowsData = visitRows.status === 'fulfilled' ? visitRows.value || [] : [];
      const urls = urlsResult.status === 'fulfilled' ? urlsResult.value.data || [] : [];

      // Log any failures for debugging
      if (totalUrlsResult.status === 'rejected') console.error('Failed to fetch total URLs:', totalUrlsResult.reason);
      if (totalVisitsResult.status === 'rejected') console.error('Failed to fetch total visits:', totalVisitsResult.reason);
      if (recentVisitsResult.status === 'rejected') console.error('Failed to fetch recent visits:', recentVisitsResult.reason);
      if (visitRows.status === 'rejected') console.error('Failed to fetch visit analytics rows:', visitRows.reason);
      if (urlsResult.status === 'rejected') console.error('Failed to fetch URLs:', urlsResult.reason);

      const visitStats = aggregateCounts(visitRowsData, 'short_path', { resultKey: 'short_path' });
      const normalizedBrowsers = aggregateCounts(visitRowsData, 'browser');
      const normalizedOs = aggregateCounts(visitRowsData, 'os');
      const visitsOverTime = aggregateVisitsOverTime(visitRowsData);

      return {
        totalUrls,
        totalVisits,
        activeUrls: totalUrls - (urls?.filter(u => u.deprecated)?.length || 0),
        deprecatedUrls: urls?.filter(u => u.deprecated)?.length || 0,
        averageClicks: totalVisits / (totalUrls || 1),
        visitStats,
        recentVisits: recentVisits,
        browserDistribution: normalizedBrowsers,
        osDistribution: normalizedOs,
        visitsOverTime,
      };
    }, 30000);

    return NextResponse.json(analyticsData);
  } catch (error) {
    console.error('Error in GET /api/admin-analytics:', {
      message: error.message,
      details: error.stack,
      hint: error.hint || '',
      code: error.code || ''
    });
    return NextResponse.json(
      { 
        error: 'Failed to fetch analytics data',
        message: error.message,
        details: error.stack,
        hint: error.hint || '',
        code: error.code || ''
      },
      { status: 500 }
    );
  }
}
