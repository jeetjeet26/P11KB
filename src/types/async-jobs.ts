/**
 * Phase 4: Frontend Integration - TypeScript types for async job state management
 * Based on timeout.md specifications
 */

// React component states as defined in Phase 4.1
export type GenerationState = 
  | 'idle' 
  | 'submitting'     // Creating job
  | 'processing'     // Job in progress
  | 'completed'      // Results available
  | 'failed'         // Error occurred

// Progress UI interface as defined in Phase 4.1
export interface JobProgress {
  step: string;
  percent: number;
  message: string;
  estimatedTimeRemaining?: string;
}

// Job status types matching database schema from Phase 1
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

// Progress step types as defined in database schema
export type ProgressStep = 'vector_search' | 'context_building' | 'generation' | 'validation' | 'cancelled';

// Campaign generation job interface matching database structure
export interface CampaignGenerationJob {
  id: string;
  client_id: string;
  campaign_name: string;
  campaign_type: string;
  ad_group_type?: string;
  
  // Job status tracking
  status: JobStatus;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  
  // Progress tracking for UI
  progress_step?: ProgressStep;
  progress_percent: number;
  
  // Results storage
  generated_copy?: any; // Store the final ad copy
  derived_context?: any; // Store extracted campaign details
  error_message?: string;
  
  // Performance metrics
  total_duration_ms?: number;
  step_durations?: any; // Track time per step for optimization
}

// API response for job creation (Phase 2.1)
export interface CreateJobResponse {
  success: boolean;
  jobId: string;
  estimatedDuration: string;
  status: JobStatus;
}

// API response for job status endpoint (Phase 2.2)
export interface JobStatusResponse {
  jobId: string;
  status: JobStatus;
  progress: {
    step: string;
    percent: number;
    message: string;
  };
  result?: any; // generated copy
  error?: string;
  createdAt: string;
  estimatedCompletion?: string;
}

// Real-time subscription payload
export interface JobUpdatePayload {
  eventType: 'UPDATE';
  new: CampaignGenerationJob;
  old?: CampaignGenerationJob;
}

// Hook return type for async job management
export interface UseAsyncJobReturn {
  // State
  job: CampaignGenerationJob | null;
  generationState: GenerationState;
  progress: JobProgress | null;
  error: string | null;
  
  // Actions
  createJob: (campaignData: any) => Promise<void>;
  cancelJob: () => void;
  retryJob: () => Promise<void>;
  
  // Cleanup
  cleanup: () => void;
}

// Job history item for recent jobs display
export interface JobHistoryItem {
  id: string;
  campaign_name: string;
  campaign_type: string;
  status: JobStatus;
  created_at: string;
  completed_at?: string;
  duration_ms?: number;
}

// Progress step configuration
export interface ProgressStepConfig {
  key: ProgressStep;
  label: string;
  description: string;
  minPercent: number;
  maxPercent: number;
}

// Error types for better error handling
export type AsyncJobError = 
  | 'TIMEOUT_ERROR'
  | 'NETWORK_ERROR'
  | 'VALIDATION_ERROR'
  | 'PROCESSING_ERROR'
  | 'SUBSCRIPTION_ERROR';

export interface AsyncJobErrorDetails {
  type: AsyncJobError;
  message: string;
  jobId?: string;
  retryable: boolean;
}
