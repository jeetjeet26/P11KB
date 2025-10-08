/**
 * Phase 5: User Experience Enhancements - Job Cancellation API
 * Implements job cancellation capability as specified in timeout.md Phase 5.2
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const { jobId } = params;
    
    if (!jobId) {
      return NextResponse.json(
        { error: 'Job ID is required' },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // First, verify the job exists and is cancellable
    const { data: job, error: fetchError } = await supabase
      .from('campaign_generation_jobs')
      .select('id, status, client_id')
      .eq('id', jobId)
      .single();

    if (fetchError || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Check if job is in a cancellable state
    if (!['pending', 'processing'].includes(job.status)) {
      return NextResponse.json(
        { 
          error: `Cannot cancel job with status: ${job.status}`,
          cancellable: false
        },
        { status: 400 }
      );
    }

    // Update job status to cancelled
    const { error: updateError } = await supabase
      .from('campaign_generation_jobs')
      .update({
        status: 'cancelled',
        completed_at: new Date().toISOString(),
        error_message: 'Job cancelled by user',
        progress_step: 'cancelled',
        progress_percent: 0
      })
      .eq('id', jobId);

    if (updateError) {
      console.error('[CANCEL-JOB] Database update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to cancel job' },
        { status: 500 }
      );
    }

    // TODO: If using external job processors (like Supabase Edge Functions),
    // we would also need to send a cancellation signal to the running process
    // For now, we'll rely on the job processor checking the database status
    
    console.log(`[CANCEL-JOB] Successfully cancelled job ${jobId}`);

    return NextResponse.json({
      success: true,
      message: 'Job cancelled successfully',
      jobId,
      status: 'cancelled'
    });

  } catch (error: any) {
    console.error('[CANCEL-JOB] Unexpected error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
