import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface JobStatusParams {
  params: {
    jobId: string;
  };
}

/**
 * Phase 2.2: Job Status Endpoint
 * GET /api/campaigns/jobs/{jobId}
 * Returns current job status, progress, and results
 */
export async function GET(req: NextRequest, { params }: JobStatusParams) {
  try {
    const { jobId } = params;

    if (!jobId) {
      return NextResponse.json({
        success: false,
        error: 'Job ID is required'
      }, { status: 400 });
    }

    const supabase = createClient();

    console.log(`[JOB-STATUS] Checking status for job ${jobId}`);

    // Fetch job from database
    const { data: job, error: jobError } = await supabase
      .from('campaign_generation_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError) {
      if (jobError.code === 'PGRST116') {
        return NextResponse.json({
          success: false,
          error: 'Job not found'
        }, { status: 404 });
      }
      
      console.error('[JOB-STATUS] Database error:', jobError);
      return NextResponse.json({
        success: false,
        error: `Database error: ${jobError.message}`
      }, { status: 500 });
    }

    // Calculate estimated completion time
    const estimatedCompletion = calculateEstimatedCompletion(job);

    // Phase 2.2 Response Structure as specified in timeout.md
    const response = {
      jobId: job.id,
      status: job.status, // pending, processing, completed, failed
      progress: {
        step: job.progress_step || 'queued',
        percent: job.progress_percent || 0,
        message: getProgressMessage(job.progress_step, job.status)
      },
      createdAt: job.created_at,
      startedAt: job.started_at,
      completedAt: job.completed_at,
      estimatedCompletion,
      
      // Include results if completed
      ...(job.status === 'completed' && job.generated_copy ? {
        result: {
          generatedCopy: job.generated_copy,
          derivedContext: job.derived_context,
          characterValidation: job.generated_copy.character_validation,
          validationSummary: calculateValidationSummary(job.generated_copy)
        }
      } : {}),
      
      // Include error if failed
      ...(job.status === 'failed' && job.error_message ? {
        error: job.error_message
      } : {}),
      
      // Include performance metrics if available
      ...(job.total_duration_ms ? {
        performanceMetrics: {
          totalDurationMs: job.total_duration_ms,
          stepDurations: job.step_durations
        }
      } : {})
    };

    console.log(`[JOB-STATUS] Job ${jobId}: ${job.status} (${job.progress_percent}%)`);
    
    return NextResponse.json({
      success: true,
      ...response
    });

  } catch (error: any) {
    console.error("Job status check failed:", error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}

/**
 * Calculate estimated completion time based on job status and progress
 */
function calculateEstimatedCompletion(job: any): string | null {
  if (job.status === 'completed' || job.status === 'failed') {
    return null; // No estimation needed for finished jobs
  }
  
  if (job.status === 'pending') {
    // Job hasn't started yet, estimate based on creation time + typical delay
    const createdAt = new Date(job.created_at);
    const estimatedStart = new Date(createdAt.getTime() + (30 * 1000)); // 30 seconds delay
    const estimatedDuration = getEstimatedDurationMs(job.campaign_type);
    const estimatedCompletion = new Date(estimatedStart.getTime() + estimatedDuration);
    return estimatedCompletion.toISOString();
  }
  
  if (job.status === 'processing' && job.started_at) {
    // Job is running, estimate based on progress
    const startedAt = new Date(job.started_at);
    const progressPercent = job.progress_percent || 0;
    const elapsedMs = Date.now() - startedAt.getTime();
    
    if (progressPercent > 0) {
      // Extrapolate based on current progress
      const totalEstimatedMs = (elapsedMs / progressPercent) * 100;
      const remainingMs = totalEstimatedMs - elapsedMs;
      const estimatedCompletion = new Date(Date.now() + remainingMs);
      return estimatedCompletion.toISOString();
    } else {
      // Default estimation if no progress yet
      const estimatedDuration = getEstimatedDurationMs(job.campaign_type);
      const estimatedCompletion = new Date(startedAt.getTime() + estimatedDuration);
      return estimatedCompletion.toISOString();
    }
  }
  
  return null;
}

/**
 * Get estimated duration in milliseconds based on campaign type
 */
function getEstimatedDurationMs(campaignType: string): number {
  // Base duration: 2-3 minutes
  let baseMs = 2 * 60 * 1000; // 2 minutes
  
  // Proximity campaigns take longer due to Google Maps integration
  if (campaignType === 're_proximity') {
    baseMs += 60 * 1000; // +1 minute
  }
  
  return baseMs;
}

/**
 * Get user-friendly progress message based on current step and status
 */
function getProgressMessage(progressStep: string | null, status: string): string {
  if (status === 'pending') {
    return 'Job queued for processing...';
  }
  
  if (status === 'failed') {
    return 'Generation failed';
  }
  
  if (status === 'completed') {
    return 'Generation completed successfully!';
  }
  
  // Processing status - map step to user message
  switch (progressStep) {
    case 'vector_search':
      return 'Searching knowledge base...';
    case 'context_building':
      return 'Building campaign context...';
    case 'generation':
      return 'Generating copy with AI...';
    case 'validation':
      return 'Validating and correcting...';
    case 'finalization':
      return 'Finalizing results...';
    default:
      return 'Processing...';
  }
}

/**
 * Calculate validation summary from generated copy
 */
function calculateValidationSummary(generatedCopy: any): any {
  if (!generatedCopy || !generatedCopy.character_validation) {
    return {
      headlinesValid: 0,
      descriptionsValid: 0,
      totalHeadlines: 0,
      totalDescriptions: 0
    };
  }
  
  const { headlines_valid, descriptions_valid } = generatedCopy.character_validation;
  
  return {
    headlinesValid: headlines_valid?.filter((h: any) => h.valid).length || 0,
    descriptionsValid: descriptions_valid?.filter((d: any) => d.valid).length || 0,
    totalHeadlines: headlines_valid?.length || 0,
    totalDescriptions: descriptions_valid?.length || 0
  };
}
