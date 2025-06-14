'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { BarChartIcon, GlobeIcon, PersonIcon, Link2Icon } from '@radix-ui/react-icons';
import LoadingSpinner from './LoadingSpinner';

export default function AnalyticsDashboard({ analytics, isLoading, error }) {
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
    recentVisits
  } = analytics;

  return (
    <div className="space-y-8">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition-all duration-200 hover:shadow-lg hover:shadow-blue-500/5 group">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500/10 rounded-lg group-hover:bg-blue-500/20 transition-colors duration-200">
              <BarChartIcon className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-gray-400 mb-1">Total Visits</p>
              <p className="text-2xl font-semibold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                {totalVisits.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition-all duration-200 hover:shadow-lg hover:shadow-green-500/5 group">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-500/10 rounded-lg group-hover:bg-green-500/20 transition-colors duration-200">
              <Link2Icon className="w-6 h-6 text-green-500" />
            </div>
            <div>
              <p className="text-sm text-gray-400 mb-1">Active URLs</p>
              <p className="text-2xl font-semibold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                {activeUrls}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition-all duration-200 hover:shadow-lg hover:shadow-yellow-500/5 group">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-yellow-500/10 rounded-lg group-hover:bg-yellow-500/20 transition-colors duration-200">
              <GlobeIcon className="w-6 h-6 text-yellow-500" />
            </div>
            <div>
              <p className="text-sm text-gray-400 mb-1">Average Clicks</p>
              <p className="text-2xl font-semibold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                {averageClicks}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition-all duration-200 hover:shadow-lg hover:shadow-purple-500/5 group">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-500/10 rounded-lg group-hover:bg-purple-500/20 transition-colors duration-200">
              <PersonIcon className="w-6 h-6 text-purple-500" />
            </div>
            <div>
              <p className="text-sm text-gray-400 mb-1">Total URLs</p>
              <p className="text-2xl font-semibold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                {totalUrls}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Top URLs */}
      <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-200 mb-4">Top URLs</h3>
        <div className="space-y-4">
          {visitStats.slice(0, 5).map((stat, index) => (
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

      {/* Recent Activity */}
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
} 