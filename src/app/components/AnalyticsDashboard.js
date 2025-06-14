'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { BarChartIcon, GlobeIcon, PersonIcon, Link2Icon, ClockIcon } from '@radix-ui/react-icons';
import LoadingSpinner from './LoadingSpinner';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

const TIME_RANGES = [
  { label: 'Last 7 days', value: 7 },
  { label: 'Last 30 days', value: 30 },
  { label: 'Last 90 days', value: 90 },
  { label: 'Last 180 days', value: 180 },
  { label: 'Last 365 days', value: 365 },
  { label: 'All time', value: 0 }
];

export default function AnalyticsDashboard({ analytics: initialAnalytics, isLoading: initialLoading, error: initialError }) {
  const [selectedTimeRange, setSelectedTimeRange] = useState(30); // Default to 30 days
  const [analytics, setAnalytics] = useState(initialAnalytics);
  const [isLoading, setIsLoading] = useState(initialLoading);
  const [error, setError] = useState(initialError);

  useEffect(() => {
    const fetchAnalytics = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/admin-analytics?timeRange=${selectedTimeRange}`);
        if (!response.ok) {
          throw new Error('Failed to fetch analytics');
        }
        const data = await response.json();
        setAnalytics(data);
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAnalytics();
  }, [selectedTimeRange]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
        <p className="text-red-500 text-sm">{error}</p>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400">No analytics data available.</p>
      </div>
    );
  }

  const {
    totalVisits,
    totalUrls,
    activeUrls,
    deprecatedUrls,
    averageClicks,
    visitStats,
    recentVisits,
    browserDistribution,
    osDistribution,
    visitsOverTime
  } = analytics;

  // Filter data based on selected time range
  const filterDataByTimeRange = (data, dateKey = 'date') => {
    if (selectedTimeRange === 0) return data; // All time
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - selectedTimeRange);
    
    return data.filter(item => new Date(item[dateKey]) >= cutoffDate);
  };

  const filteredVisitsOverTime = filterDataByTimeRange(visitsOverTime);
  const filteredBrowserDistribution = filterDataByTimeRange(browserDistribution, 'name');
  const filteredOSDistribution = filterDataByTimeRange(osDistribution, 'name');
  const filteredVisitStats = filterDataByTimeRange(visitStats, 'short_path');

  return (
    <div className="space-y-8">
      {/* Time Range Selector */}
      <div className="flex justify-end">
        <div className="relative">
          <select
            value={selectedTimeRange}
            onChange={(e) => setSelectedTimeRange(Number(e.target.value))}
            className="appearance-none bg-[#1a1a1a] border border-gray-800 rounded-lg px-4 py-2 pr-10 text-gray-300 focus:outline-none focus:border-gray-600"
          >
            {TIME_RANGES.map(range => (
              <option key={range.value} value={range.value}>
                {range.label}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
            <ClockIcon className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Main Analytics Grid */}
      <div className="space-y-6">
        {/* Visits Over Time */}
        <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-gray-200 mb-4">Visits Over Time (Daily)</h3>
          {filteredVisitsOverTime.length === 0 ? (
            <p className="text-gray-400">No time-based visit data available.</p>
          ) : (
            <div className="h-64">
              <Bar
                data={{
                  labels: filteredVisitsOverTime.map(data => data.date),
                  datasets: [
                    {
                      label: 'Total Visits',
                      data: filteredVisitsOverTime.map(data => data.count),
                      backgroundColor: 'rgba(59, 130, 246, 0.6)',
                      borderColor: 'rgba(59, 130, 246, 1)',
                      borderWidth: 1,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: true, labels: { color: '#A0A0A0' } },
                    title: { display: false },
                  },
                  scales: {
                    x: { ticks: { color: '#A0A0A0' }, grid: { color: '#333' } },
                    y: { ticks: { color: '#A0A0A0' }, grid: { color: '#333' } },
                  },
                }}
              />
            </div>
          )}
        </div>

        {/* Client Distribution (Browser and OS) */}
        <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-gray-200 mb-4">Client Distribution</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Browser Distribution */}
            <div>
              <h4 className="text-md font-semibold text-gray-300 mb-2">Browser</h4>
              {filteredBrowserDistribution.length === 0 ? (
                <p className="text-gray-400 text-sm">No browser data available.</p>
              ) : (
                <div className="h-64">
                  <Bar
                    data={{
                      labels: filteredBrowserDistribution.map(data => data.name),
                      datasets: [
                        {
                          label: 'Browser Visits',
                          data: filteredBrowserDistribution.map(data => data.count),
                          backgroundColor: 'rgba(75, 192, 192, 0.6)',
                          borderColor: 'rgba(75, 192, 192, 1)',
                          borderWidth: 1,
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { display: true, labels: { color: '#A0A0A0' } },
                        title: { display: false },
                      },
                      scales: {
                        x: { ticks: { color: '#A0A0A0' }, grid: { color: '#333' } },
                        y: { ticks: { color: '#A0A0A0' }, grid: { color: '#333' } },
                      },
                    }}
                  />
                </div>
              )}
            </div>

            {/* OS Distribution */}
            <div>
              <h4 className="text-md font-semibold text-gray-300 mb-2">Operating System</h4>
              {filteredOSDistribution.length === 0 ? (
                <p className="text-gray-400 text-sm">No OS data available.</p>
              ) : (
                <div className="h-64">
                  <Bar
                    data={{
                      labels: filteredOSDistribution.map(data => data.name),
                      datasets: [
                        {
                          label: 'OS Visits',
                          data: filteredOSDistribution.map(data => data.count),
                          backgroundColor: 'rgba(153, 102, 255, 0.6)',
                          borderColor: 'rgba(153, 102, 255, 1)',
                          borderWidth: 1,
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { display: true, labels: { color: '#A0A0A0' } },
                        title: { display: false },
                      },
                      scales: {
                        x: { ticks: { color: '#A0A0A0' }, grid: { color: '#333' } },
                        y: { ticks: { color: '#A0A0A0' }, grid: { color: '#333' } },
                      },
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Top URLs */}
        <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-gray-200 mb-4">Top URLs</h3>
          <div className="space-y-4">
            {filteredVisitStats.slice(0, 5).map((stat, index) => (
              <div
                key={stat.short_path}
                className="flex items-center gap-4 p-3 bg-[#0a0a0a] border border-gray-800 rounded-lg hover:border-gray-700 transition-all duration-200"
              >
                <div className="w-8 h-8 flex items-center justify-center bg-blue-500/10 rounded-lg text-blue-500 font-semibold">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-200 font-medium truncate">/{stat.short_path}</p>
                </div>
                <div className="text-sm text-gray-400">
                  {stat.count.toLocaleString()} clicks
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Activity - Full Width Below Main Grid */}
      <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-200 mb-4">Recent Activity</h3>
        <div className="space-y-4">
          {recentVisits.map((visit, index) => (
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
                <p className="text-xs text-gray-500">
                  {new Date(visit.visited_at).toLocaleString()}
                </p>
                <p className="text-xs text-gray-500">
                  User ID: {visit.user_id}
                </p>
              </div>
              <div className="text-sm text-gray-400 text-right">
                <p>{visit.ip_address}</p>
                <p>{visit.environment}</p>
                <p>{visit.version_number}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
} 