import { NextResponse } from 'next/server';
import { validateRequest } from '@/app/lib/authMiddleware';
import supabase, { getCachedData } from '@/app/lib/supabase';

export async function GET(req) {
  try {
    if (!await validateRequest(req)) {
      console.warn('Unauthorized access attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use cached data for analytics that don't need real-time updates
    const analyticsData = await getCachedData('analytics', async () => {
      // Run all queries in parallel
      const [
        { count: totalUrls, error: urlError },
        { count: totalVisits, error: visitError },
        { data: visits, error: visitsError },
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
        
        // Get all visits' short_path
        supabase
          .from('visits')
          .select('short_path'),
        
        // Get recent visits (last 10)
        supabase
          .from('visits')
          .select('short_path, user_agent, ip_address, environment, version_number')
          .order('id', { ascending: false })
          .limit(10)
      ]);

      // Check for any errors
      if (urlError) throw urlError;
      if (visitError) throw visitError;
      if (visitsError) throw visitsError;
      if (recentError) throw recentError;

      // Group and count visits per short_path
      const visitCounts = {};
      for (const visit of visits) {
        if (!visit.short_path) continue;
        visitCounts[visit.short_path] = (visitCounts[visit.short_path] || 0) + 1;
      }
      const visitsPerUrl = Object.entries(visitCounts)
        .map(([short_path, count]) => ({ short_path, count }))
        .sort((a, b) => b.count - a.count);

      return {
        totalUrls,
        totalVisits,
        visitStats: visitsPerUrl,
        recentVisits
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