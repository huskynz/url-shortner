import { NextResponse } from 'next/server';
import { validateRequest } from '@/app/lib/authMiddleware';
import supabase, { getCachedData } from '@/app/lib/supabase';

// Helper to parse browser from user agent
function getBrowser(userAgent) {
  if (!userAgent) return 'Unknown';
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('SamsungBrowser')) return 'Samsung Browser';
  if (userAgent.includes('Opera') || userAgent.includes('OPR')) return 'Opera';
  if (userAgent.includes('Edge')) return 'Edge';
  if (userAgent.includes('Chrome')) return 'Chrome';
  if (userAgent.includes('Safari')) return 'Safari';
  if (userAgent.includes('MSIE') || userAgent.includes('Trident')) return 'IE';
  return 'Unknown';
}

// Helper to parse OS from user agent
function getOS(userAgent) {
  if (!userAgent) return 'Unknown';
  if (userAgent.includes('Windows')) return 'Windows';
  if (userAgent.includes('Android')) return 'Android';
  if (userAgent.includes('iPhone') || userAgent.includes('iPad')) return 'iOS';
  if (userAgent.includes('Mac')) return 'macOS';
  if (userAgent.includes('Linux')) return 'Linux';
  return 'Unknown';
}

export async function GET(req) {
  try {
    if (!await validateRequest(req)) {
      console.warn('Unauthorized access attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get time range from query parameters
    const { searchParams } = new URL(req.url);
    const timeRange = parseInt(searchParams.get('timeRange') || '30'); // Default to 30 days

    // Use cached data for analytics that don't need real-time updates
    const analyticsData = await getCachedData(`analytics_${timeRange}`, async () => {
      // Calculate the cutoff date based on time range
      const cutoffDate = new Date();
      if (timeRange > 0) {
        cutoffDate.setDate(cutoffDate.getDate() - timeRange);
      }

      // Run all queries in parallel
      const [
        { count: totalUrls, error: urlError },
        { count: totalVisits, error: visitError },
        { data: allVisits, error: allVisitsError }, // Fetch all visits for aggregation
        { data: recentVisits, error: recentError }
      ] = await Promise.all([
        // Get total number of URLs
        supabase
          .from(process.env.SUPABASE_DB_NAME)
          .select('*', { count: 'exact', head: true }),
        
        // Get total number of visits
        supabase
          .from('visits')
          .select('*', { count: 'exact', head: true }),
        
        // Get all visits (all columns needed for full analysis)
        supabase
          .from('visits')
          .select('short_path, user_agent, ip_address, environment, version_number, visited_at, user_id')
          .gte('visited_at', timeRange === 0 ? '1970-01-01' : cutoffDate.toISOString()),
        
        // Get recent visits (last 10)
        supabase
          .from('visits')
          .select('short_path, user_agent, ip_address, environment, version_number, visited_at, user_id')
          .order('id', { ascending: false })
          .limit(10)
      ]);

      // Check for any errors
      if (urlError) throw urlError;
      if (visitError) throw visitError;
      if (allVisitsError) throw allVisitsError;
      if (recentError) throw recentError;

      // Group and count visits per short_path
      const visitCounts = {};
      for (const visit of allVisits) {
        if (!visit.short_path) continue;
        visitCounts[visit.short_path] = (visitCounts[visit.short_path] || 0) + 1;
      }
      const visitsPerUrl = Object.entries(visitCounts)
        .map(([short_path, count]) => ({ short_path, count }))
        .sort((a, b) => b.count - a.count);

      // Process allVisits for browser/OS distribution and visits over time
      const browserCounts = {};
      const osCounts = {};
      const visitsByDate = {};

      // Initialize dates for the selected time range
      if (timeRange > 0) {
        const startDate = new Date(cutoffDate);
        const endDate = new Date();
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
          visitsByDate[d.toISOString().split('T')[0]] = 0;
        }
      }

      for (const visit of allVisits) {
        // Browser and OS distribution
        const browser = getBrowser(visit.user_agent);
        const os = getOS(visit.user_agent);
        browserCounts[browser] = (browserCounts[browser] || 0) + 1;
        osCounts[os] = (osCounts[os] || 0) + 1;

        // Visits over time (daily)
        const date = new Date(visit.visited_at).toISOString().split('T')[0]; // YYYY-MM-DD
        visitsByDate[date] = (visitsByDate[date] || 0) + 1;
      }

      // Sort browser and OS distributions by count
      const browserDistribution = Object.entries(browserCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      const osDistribution = Object.entries(osCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      // Convert visitsByDate to array and sort by date
      const visitsOverTime = Object.entries(visitsByDate)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => new Date(a.date) - new Date(b.date));

      return {
        totalUrls,
        totalVisits,
        visitStats: visitsPerUrl,
        recentVisits,
        browserDistribution,
        osDistribution,
        visitsOverTime,
      };
    }, 30000); // Cache for 30 seconds

    return NextResponse.json(analyticsData);
  } catch (error) {
    console.error('Error in GET /api/admin-analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics data' },
      { status: 500 }
    );
  }
} 