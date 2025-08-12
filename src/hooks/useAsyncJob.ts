/**
 * Phase 4: Frontend Integration - React hook for async job progress tracking
 * Implements real-time subscriptions and fallback polling as specified in timeout.md
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { 
  CampaignGenerationJob, 
  GenerationState, 
  JobProgress, 
  UseAsyncJobReturn,
  ProgressStep,
  ProgressStepConfig,
  CreateJobResponse,
  JobStatusResponse,
  AsyncJobErrorDetails
} from '@/types/async-jobs';

// Progress step configurations as defined in Phase 3.2
const PROGRESS_STEPS: ProgressStepConfig[] = [
  {
    key: 'vector_search',
    label: 'Vector Search',
    description: 'Searching knowledge base...',
    minPercent: 0,
    maxPercent: 25
  },
  {
    key: 'context_building',
    label: 'Context Building',
    description: 'Building campaign context...',
    minPercent: 25,
    maxPercent: 50
  },
  {
    key: 'generation',
    label: 'Content Generation',
    description: 'Generating copy with AI...',
    minPercent: 50,
    maxPercent: 85
  },
  {
    key: 'validation',
    label: 'Validation',
    description: 'Validating and correcting...',
    minPercent: 85,
    maxPercent: 95
  }
];

export function useAsyncJob(clientId: string): UseAsyncJobReturn {
  const supabase = createClient();
  const [job, setJob] = useState<CampaignGenerationJob | null>(null);
  const [generationState, setGenerationState] = useState<GenerationState>('idle');
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Refs for cleanup and polling
  const subscriptionRef = useRef<any>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isCleanedUpRef = useRef(false);

  // Helper function to get progress message and estimated time
  const getProgressInfo = useCallback((step: ProgressStep, percent: number): JobProgress => {
    const stepConfig = PROGRESS_STEPS.find(s => s.key === step);
    const stepLabel = stepConfig?.label || 'Processing';
    const stepDescription = stepConfig?.description || 'Processing your request...';
    
    // Calculate estimated time remaining (rough estimate)
    const totalEstimatedMs = 120000; // 2 minutes average
    const remainingPercent = Math.max(0, 100 - percent);
    const estimatedRemainingMs = (remainingPercent / 100) * totalEstimatedMs;
    const estimatedTimeRemaining = estimatedRemainingMs > 60000 
      ? `${Math.ceil(estimatedRemainingMs / 60000)} min` 
      : `${Math.ceil(estimatedRemainingMs / 1000)} sec`;

    return {
      step: stepLabel,
      percent,
      message: stepDescription,
      estimatedTimeRemaining: percent < 95 ? estimatedTimeRemaining : undefined
    };
  }, []);

  // Update progress based on job state
  const updateProgressFromJob = useCallback((jobData: CampaignGenerationJob) => {
    if (jobData.status === 'processing' && jobData.progress_step) {
      const progressInfo = getProgressInfo(
        jobData.progress_step as ProgressStep,
        jobData.progress_percent || 0
      );
      setProgress(progressInfo);
    } else if (jobData.status === 'completed') {
      setProgress({
        step: 'Completion',
        percent: 100,
        message: 'Ready for review!',
        estimatedTimeRemaining: undefined
      });
    } else if (jobData.status === 'failed') {
      setProgress(null);
    }
  }, [getProgressInfo]);

  // Handle job updates from real-time subscription or polling
  const handleJobUpdate = useCallback((updatedJob: CampaignGenerationJob) => {
    if (isCleanedUpRef.current) return;

    setJob(updatedJob);
    updateProgressFromJob(updatedJob);

    // Update generation state based on job status
    switch (updatedJob.status) {
      case 'pending':
        setGenerationState('submitting');
        break;
      case 'processing':
        setGenerationState('processing');
        break;
      case 'completed':
        setGenerationState('completed');
        cleanup(); // Stop subscriptions when completed
        break;
      case 'failed':
        setGenerationState('failed');
        setError(updatedJob.error_message || 'Job processing failed');
        cleanup(); // Stop subscriptions when failed
        break;
    }
  }, [updateProgressFromJob]);

  // Real-time subscription setup (Phase 4.2)
  const setupRealtimeSubscription = useCallback((jobId: string) => {
    console.log('[ASYNC-JOB] Setting up real-time subscription for job:', jobId);
    
    const channel = supabase.channel('campaign-jobs')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'campaign_generation_jobs',
        filter: `id=eq.${jobId}`
      }, (payload) => {
        console.log('[ASYNC-JOB] Real-time update received:', payload);
        if (payload.new) {
          handleJobUpdate(payload.new as CampaignGenerationJob);
        }
      })
      .subscribe((status) => {
        console.log('[ASYNC-JOB] Subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('[ASYNC-JOB] Real-time subscription active');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[ASYNC-JOB] Real-time subscription failed, starting fallback polling');
          setupPolling(jobId);
        }
      });

    subscriptionRef.current = channel;
    return channel;
  }, [supabase, handleJobUpdate]);

  // Fallback polling mechanism (Phase 4.3)
  const setupPolling = useCallback((jobId: string) => {
    console.log('[ASYNC-JOB] Setting up fallback polling for job:', jobId);
    
    const pollJob = async () => {
      if (isCleanedUpRef.current) return;
      
      try {
        const response = await fetch(`/api/campaigns/jobs/${jobId}`);
        if (response.ok) {
          const jobStatus: JobStatusResponse = await response.json();
          const jobData: CampaignGenerationJob = {
            id: jobStatus.jobId,
            client_id: clientId,
            campaign_name: '',
            campaign_type: '',
            status: jobStatus.status,
            created_at: jobStatus.createdAt,
            progress_step: jobStatus.progress.step as ProgressStep,
            progress_percent: jobStatus.progress.percent,
            generated_copy: jobStatus.result,
            error_message: jobStatus.error
          };
          handleJobUpdate(jobData);
        }
      } catch (err) {
        console.error('[ASYNC-JOB] Polling error:', err);
      }
    };

    // Poll every 5 seconds as specified in Phase 4.3
    pollingIntervalRef.current = setInterval(pollJob, 5000);
    
    // Stop polling after 10 minutes as specified in Phase 4.3
    timeoutRef.current = setTimeout(() => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      setError('Job monitoring timed out after 10 minutes. Please check job status manually.');
      setGenerationState('failed');
    }, 10 * 60 * 1000); // 10 minutes
  }, [clientId, handleJobUpdate]);

  // Create new async job
  const createJob = useCallback(async (campaignData: any) => {
    if (isCleanedUpRef.current) return;
    
    setError(null);
    setGenerationState('submitting');
    setProgress({
      step: 'Creating Job',
      percent: 0,
      message: 'Submitting your request...',
      estimatedTimeRemaining: '2-3 min'
    });

    try {
      const response = await fetch('/api/campaigns/real-estate/generate-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          ...campaignData
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create job');
      }

      const result: CreateJobResponse = await response.json();
      console.log('[ASYNC-JOB] Job created successfully:', result);

      // Initialize job state
      const initialJob: CampaignGenerationJob = {
        id: result.jobId,
        client_id: clientId,
        campaign_name: campaignData.campaignName || '',
        campaign_type: campaignData.campaignType || '',
        ad_group_type: campaignData.adGroupType,
        status: result.status,
        created_at: new Date().toISOString(),
        progress_percent: 0
      };

      setJob(initialJob);
      setGenerationState('processing');

      // Set up real-time subscription first, with polling as fallback
      setupRealtimeSubscription(result.jobId);

    } catch (err: any) {
      console.error('[ASYNC-JOB] Job creation error:', err);
      setError(err.message);
      setGenerationState('failed');
      setProgress(null);
    }
  }, [clientId, setupRealtimeSubscription]);

  // Cancel current job
  const cancelJob = useCallback(() => {
    console.log('[ASYNC-JOB] Cancelling job');
    cleanup();
    setGenerationState('idle');
    setJob(null);
    setProgress(null);
    setError(null);
  }, []);

  // Retry failed job
  const retryJob = useCallback(async () => {
    if (!job) return;
    
    const campaignData = {
      campaignName: job.campaign_name,
      campaignType: job.campaign_type,
      adGroupType: job.ad_group_type
    };
    
    await createJob(campaignData);
  }, [job, createJob]);

  // Cleanup function
  const cleanup = useCallback(() => {
    console.log('[ASYNC-JOB] Cleaning up subscriptions and timers');
    isCleanedUpRef.current = true;

    // Clean up real-time subscription
    if (subscriptionRef.current) {
      subscriptionRef.current.unsubscribe();
      subscriptionRef.current = null;
    }

    // Clean up polling
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    // Clean up timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  // Reset cleanup flag when starting new operations
  useEffect(() => {
    if (generationState === 'submitting') {
      isCleanedUpRef.current = false;
    }
  }, [generationState]);

  return {
    job,
    generationState,
    progress,
    error,
    createJob,
    cancelJob,
    retryJob,
    cleanup
  };
}
