/**
 * Phase 5: User Experience Enhancements - Enhanced Job History & Management
 * Implements advanced job management as specified in timeout.md Phase 5.2
 */

"use client";

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { CampaignGenerationJob } from '@/types/async-jobs';

interface EnhancedJobHistoryProps {
  clientId: string;
  onRetryJob?: (job: CampaignGenerationJob) => void;
  onViewResults?: (job: CampaignGenerationJob) => void;
  onCancelJob?: (jobId: string) => void;
}

type JobFilter = 'all' | 'completed' | 'failed' | 'processing' | 'pending';
type SortBy = 'created_at' | 'campaign_name' | 'status' | 'duration';
type SortOrder = 'asc' | 'desc';

interface JobStats {
  total: number;
  completed: number;
  failed: number;
  processing: number;
  pending: number;
  avgDuration: number;
  totalDuration: number;
}

export function EnhancedJobHistory({ 
  clientId, 
  onRetryJob, 
  onViewResults, 
  onCancelJob 
}: EnhancedJobHistoryProps) {
  const supabase = createClient();
  const [jobs, setJobs] = useState<CampaignGenerationJob[]>([]);
  const [filteredJobs, setFilteredJobs] = useState<CampaignGenerationJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters and sorting
  const [filter, setFilter] = useState<JobFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [jobsPerPage] = useState(10);
  
  // Job statistics
  const [jobStats, setJobStats] = useState<JobStats>({
    total: 0,
    completed: 0,
    failed: 0,
    processing: 0,
    pending: 0,
    avgDuration: 0,
    totalDuration: 0
  });

  // Load jobs from database
  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('campaign_generation_jobs')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(100); // Load last 100 jobs

      if (fetchError) {
        throw new Error(fetchError.message);
      }

      setJobs(data || []);
    } catch (err: any) {
      setError(err.message);
      console.error('[JOB-HISTORY] Failed to load jobs:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, clientId]);

  // Calculate job statistics
  const calculateJobStats = useCallback((jobList: CampaignGenerationJob[]): JobStats => {
    const total = jobList.length;
    const completed = jobList.filter(j => j.status === 'completed').length;
    const failed = jobList.filter(j => j.status === 'failed').length;
    const processing = jobList.filter(j => j.status === 'processing').length;
    const pending = jobList.filter(j => j.status === 'pending').length;
    
    const completedJobs = jobList.filter(j => j.status === 'completed' && j.total_duration_ms);
    const totalDuration = completedJobs.reduce((sum, job) => sum + (job.total_duration_ms || 0), 0);
    const avgDuration = completedJobs.length > 0 ? totalDuration / completedJobs.length : 0;

    return {
      total,
      completed,
      failed,
      processing,
      pending,
      avgDuration,
      totalDuration
    };
  }, []);

  // Filter and sort jobs
  const applyFiltersAndSort = useCallback(() => {
    let filtered = [...jobs];

    // Apply status filter
    if (filter !== 'all') {
      filtered = filtered.filter(job => job.status === filter);
    }

    // Apply search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(job => 
        job.campaign_name.toLowerCase().includes(term) ||
        job.campaign_type.toLowerCase().includes(term) ||
        (job.ad_group_type && job.ad_group_type.toLowerCase().includes(term))
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;

      switch (sortBy) {
        case 'created_at':
          aValue = new Date(a.created_at).getTime();
          bValue = new Date(b.created_at).getTime();
          break;
        case 'campaign_name':
          aValue = a.campaign_name.toLowerCase();
          bValue = b.campaign_name.toLowerCase();
          break;
        case 'status':
          aValue = a.status;
          bValue = b.status;
          break;
        case 'duration':
          aValue = a.total_duration_ms || 0;
          bValue = b.total_duration_ms || 0;
          break;
        default:
          aValue = a.created_at;
          bValue = b.created_at;
      }

      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    setFilteredJobs(filtered);
    setJobStats(calculateJobStats(filtered));
  }, [jobs, filter, searchTerm, sortBy, sortOrder, calculateJobStats]);

  // Load jobs on mount
  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  // Apply filters when jobs or filters change
  useEffect(() => {
    applyFiltersAndSort();
  }, [applyFiltersAndSort]);

  // Format duration
  const formatDuration = (ms: number | null | undefined): string => {
    if (!ms) return 'N/A';
    
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  // Format relative time
  const formatRelativeTime = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  };

  // Get status color
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'completed': return 'text-green-700 bg-green-100';
      case 'failed': return 'text-red-700 bg-red-100';
      case 'processing': return 'text-blue-700 bg-blue-100';
      case 'pending': return 'text-yellow-700 bg-yellow-100';
      default: return 'text-gray-700 bg-gray-100';
    }
  };

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'failed':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'processing':
        return (
          <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        );
      case 'pending':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      default:
        return null;
    }
  };

  // Pagination calculations
  const totalPages = Math.ceil(filteredJobs.length / jobsPerPage);
  const startIndex = (currentPage - 1) * jobsPerPage;
  const endIndex = startIndex + jobsPerPage;
  const currentJobs = filteredJobs.slice(startIndex, endIndex);

  // Handle bulk actions
  const handleBulkRetry = () => {
    const failedJobs = filteredJobs.filter(job => job.status === 'failed');
    failedJobs.forEach(job => {
      if (onRetryJob) onRetryJob(job);
    });
  };

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center space-x-2 text-red-800">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Failed to load job history: {error}</span>
        </div>
        <button
          onClick={loadJobs}
          className="mt-3 px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h4 className="text-lg font-semibold text-gray-900">Generation Job History</h4>
        <button
          onClick={loadJobs}
          className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-gray-900">{jobStats.total}</div>
          <div className="text-xs text-gray-600">Total Jobs</div>
        </div>
        <div className="bg-green-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-green-700">{jobStats.completed}</div>
          <div className="text-xs text-green-600">Completed</div>
        </div>
        <div className="bg-red-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-red-700">{jobStats.failed}</div>
          <div className="text-xs text-red-600">Failed</div>
        </div>
        <div className="bg-blue-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-blue-700">{jobStats.processing + jobStats.pending}</div>
          <div className="text-xs text-blue-600">Active</div>
        </div>
        <div className="bg-purple-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-purple-700">{formatDuration(jobStats.avgDuration)}</div>
          <div className="text-xs text-purple-600">Avg Duration</div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        {/* Search */}
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search campaigns..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        
        {/* Status Filter */}
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as JobFilter)}
          className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <option value="all">All Status</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="processing">Processing</option>
          <option value="pending">Pending</option>
        </select>

        {/* Sort By */}
        <select
          value={`${sortBy}-${sortOrder}`}
          onChange={(e) => {
            const [newSortBy, newSortOrder] = e.target.value.split('-') as [SortBy, SortOrder];
            setSortBy(newSortBy);
            setSortOrder(newSortOrder);
          }}
          className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <option value="created_at-desc">Newest First</option>
          <option value="created_at-asc">Oldest First</option>
          <option value="campaign_name-asc">Name A-Z</option>
          <option value="campaign_name-desc">Name Z-A</option>
          <option value="status-asc">Status A-Z</option>
          <option value="duration-desc">Longest Duration</option>
          <option value="duration-asc">Shortest Duration</option>
        </select>
      </div>

      {/* Bulk Actions */}
      {jobStats.failed > 0 && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm text-yellow-800">
              {jobStats.failed} failed job{jobStats.failed > 1 ? 's' : ''} found
            </span>
            <button
              onClick={handleBulkRetry}
              className="px-3 py-1 bg-yellow-600 text-white rounded text-sm hover:bg-yellow-700"
            >
              Retry All Failed
            </button>
          </div>
        </div>
      )}

      {/* Job List */}
      {currentJobs.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          {filteredJobs.length === 0 && jobs.length === 0 ? (
            <div>
              <svg className="w-12 h-12 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p>No generation jobs yet</p>
              <p className="text-sm">Generate your first campaign to see job history</p>
            </div>
          ) : (
            <p>No jobs match your current filters</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {currentJobs.map((job) => (
            <div
              key={job.id}
              className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h5 className="font-medium text-gray-900">{job.campaign_name}</h5>
                    <span className={`inline-flex items-center space-x-1 px-2 py-1 text-xs rounded-full ${getStatusColor(job.status)}`}>
                      {getStatusIcon(job.status)}
                      <span className="capitalize">{job.status}</span>
                    </span>
                  </div>
                  
                  <div className="text-sm text-gray-600 space-y-1">
                    <div className="flex items-center space-x-4">
                      <span>{job.campaign_type?.replace('re_', '').replace('_', ' ')}</span>
                      {job.ad_group_type && (
                        <span>• {job.ad_group_type.replace('_', ' ')}</span>
                      )}
                      <span>• {formatRelativeTime(job.created_at)}</span>
                      {job.total_duration_ms && (
                        <span>• Duration: {formatDuration(job.total_duration_ms)}</span>
                      )}
                    </div>
                    
                    {job.progress_step && job.status === 'processing' && (
                      <div className="flex items-center space-x-2">
                        <div className="w-32 bg-gray-200 rounded-full h-1.5">
                          <div 
                            className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${job.progress_percent || 0}%` }}
                          ></div>
                        </div>
                        <span className="text-xs">{job.progress_percent || 0}% - {job.progress_step.replace('_', ' ')}</span>
                      </div>
                    )}
                    
                    {job.error_message && (
                      <div className="text-red-600 text-xs bg-red-50 p-2 rounded mt-2">
                        {job.error_message}
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center space-x-2 ml-4">
                  {job.status === 'completed' && job.generated_copy && onViewResults && (
                    <button
                      onClick={() => onViewResults(job)}
                      className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                    >
                      View Results
                    </button>
                  )}
                  
                  {job.status === 'failed' && onRetryJob && (
                    <button
                      onClick={() => onRetryJob(job)}
                      className="px-3 py-1 bg-purple-600 text-white rounded text-sm hover:bg-purple-700"
                    >
                      Retry
                    </button>
                  )}
                  
                  {(job.status === 'processing' || job.status === 'pending') && onCancelJob && (
                    <button
                      onClick={() => onCancelJob(job.id)}
                      className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                    >
                      Cancel
                    </button>
                  )}
                  
                  <button
                    onClick={() => {
                      const jobDetails = {
                        'Job ID': job.id,
                        'Campaign': job.campaign_name,
                        'Type': job.campaign_type,
                        'Status': job.status,
                        'Created': new Date(job.created_at).toLocaleString(),
                        'Duration': formatDuration(job.total_duration_ms)
                      };
                      
                      const text = Object.entries(jobDetails)
                        .map(([key, value]) => `${key}: ${value}`)
                        .join('\n');
                      
                      navigator.clipboard.writeText(text);
                    }}
                    className="px-2 py-1 text-gray-500 hover:text-gray-700 text-sm"
                    title="Copy job details"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <div className="text-sm text-gray-600">
            Showing {startIndex + 1}-{Math.min(endIndex, filteredJobs.length)} of {filteredJobs.length} jobs
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Previous
            </button>
            
            <div className="flex space-x-1">
              {[...Array(totalPages)].map((_, i) => {
                const page = i + 1;
                if (
                  page === 1 ||
                  page === totalPages ||
                  (page >= currentPage - 1 && page <= currentPage + 1)
                ) {
                  return (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`px-3 py-1 text-sm rounded ${
                        page === currentPage
                          ? 'bg-purple-600 text-white'
                          : 'border border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {page}
                    </button>
                  );
                } else if (page === currentPage - 2 || page === currentPage + 2) {
                  return <span key={page} className="px-2 text-gray-400">...</span>;
                }
                return null;
              })}
            </div>
            
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
