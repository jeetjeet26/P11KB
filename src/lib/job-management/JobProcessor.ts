import { createClient } from '@/lib/supabase/server';

export interface JobProgressUpdate {
  jobId: string;
  step: string;
  percent: number;
  message?: string;
}

export interface JobResult {
  generatedCopy: any;
  derivedContext: any;
  performanceMetrics: {
    totalDurationMs: number;
    stepDurations: Record<string, number>;
  };
}

/**
 * Phase 2.4: Job Management Utilities
 * Centralized job status and progress management
 */
export class JobProcessor {
  private supabase;

  constructor() {
    this.supabase = createClient();
  }

  /**
   * Update job status in the database
   */
  async updateJobStatus(
    jobId: string, 
    status: 'pending' | 'processing' | 'completed' | 'failed',
    error?: string
  ): Promise<void> {
    const updateData: any = { 
      status,
      ...(status === 'processing' && { started_at: new Date().toISOString() }),
      ...(status === 'completed' && { completed_at: new Date().toISOString() }),
      ...(status === 'failed' && { 
        completed_at: new Date().toISOString(),
        error_message: error 
      })
    };

    const { error: updateError } = await this.supabase
      .from('campaign_generation_jobs')
      .update(updateData)
      .eq('id', jobId);

    if (updateError) {
      console.error(`[JOB-PROCESSOR] Failed to update job ${jobId} status:`, updateError);
      throw new Error(`Failed to update job status: ${updateError.message}`);
    }

    console.log(`[JOB-PROCESSOR] Job ${jobId} status updated to: ${status}`);
  }

  /**
   * Update job progress with real-time notifications
   */
  async updateJobProgress(update: JobProgressUpdate): Promise<void> {
    const { jobId, step, percent, message } = update;

    const { error: updateError } = await this.supabase
      .from('campaign_generation_jobs')
      .update({
        progress_step: step,
        progress_percent: percent,
        ...(message && { error_message: null }) // Clear any previous error messages on progress
      })
      .eq('id', jobId);

    if (updateError) {
      console.error(`[JOB-PROCESSOR] Failed to update job ${jobId} progress:`, updateError);
      throw new Error(`Failed to update job progress: ${updateError.message}`);
    }

    console.log(`[JOB-PROCESSOR] Job ${jobId} progress: ${step} (${percent}%)`);
  }

  /**
   * Save job results to database
   */
  async saveJobResults(jobId: string, results: JobResult): Promise<void> {
    const { generatedCopy, derivedContext, performanceMetrics } = results;

    const { error: updateError } = await this.supabase
      .from('campaign_generation_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        generated_copy: generatedCopy,
        derived_context: derivedContext,
        total_duration_ms: performanceMetrics.totalDurationMs,
        step_durations: performanceMetrics.stepDurations,
        progress_percent: 100,
        progress_step: 'completed'
      })
      .eq('id', jobId);

    if (updateError) {
      console.error(`[JOB-PROCESSOR] Failed to save job ${jobId} results:`, updateError);
      throw new Error(`Failed to save job results: ${updateError.message}`);
    }

    console.log(`[JOB-PROCESSOR] Job ${jobId} completed successfully in ${performanceMetrics.totalDurationMs}ms`);
  }

  /**
   * Mark job as failed with error details
   */
  async failJob(jobId: string, error: string): Promise<void> {
    await this.updateJobStatus(jobId, 'failed', error);
  }

  /**
   * Get pending jobs for processing
   */
  async getPendingJobs(limit: number = 10): Promise<any[]> {
    const { data: jobs, error } = await this.supabase
      .from('campaign_generation_jobs')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('[JOB-PROCESSOR] Failed to fetch pending jobs:', error);
      throw new Error(`Failed to fetch pending jobs: ${error.message}`);
    }

    return jobs || [];
  }

  /**
   * Check if a job exists and get its current status
   */
  async getJobStatus(jobId: string): Promise<any | null> {
    const { data: job, error } = await this.supabase
      .from('campaign_generation_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Job not found
      }
      throw new Error(`Failed to get job status: ${error.message}`);
    }

    return job;
  }

  /**
   * Cleanup old completed/failed jobs (for maintenance)
   */
  async cleanupOldJobs(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const { data: deletedJobs, error } = await this.supabase
      .from('campaign_generation_jobs')
      .delete()
      .in('status', ['completed', 'failed'])
      .lt('completed_at', cutoffDate.toISOString())
      .select('id');

    if (error) {
      console.error('[JOB-PROCESSOR] Failed to cleanup old jobs:', error);
      throw new Error(`Failed to cleanup old jobs: ${error.message}`);
    }

    const deletedCount = deletedJobs?.length || 0;
    console.log(`[JOB-PROCESSOR] Cleaned up ${deletedCount} old jobs`);
    
    return deletedCount;
  }
}

/**
 * Progress step constants for standardized tracking
 */
export const PROGRESS_STEPS = {
  QUEUED: 'queued',
  VECTOR_SEARCH: 'vector_search',
  CONTEXT_BUILDING: 'context_building', 
  GENERATION: 'generation',
  VALIDATION: 'validation',
  FINALIZATION: 'finalization',
  COMPLETED: 'completed'
} as const;

/**
 * Progress percentages for each step
 */
export const PROGRESS_PERCENTAGES = {
  [PROGRESS_STEPS.QUEUED]: 0,
  [PROGRESS_STEPS.VECTOR_SEARCH]: 25,
  [PROGRESS_STEPS.CONTEXT_BUILDING]: 50,
  [PROGRESS_STEPS.GENERATION]: 75,
  [PROGRESS_STEPS.VALIDATION]: 90,
  [PROGRESS_STEPS.FINALIZATION]: 95,
  [PROGRESS_STEPS.COMPLETED]: 100
} as const;
