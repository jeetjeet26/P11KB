import { NextRequest, NextResponse } from 'next/server';

/**
 * TEST ENDPOINT: Manual Job Processing Trigger
 * Use this to manually trigger job processing during development
 * 
 * Usage: GET /api/test/trigger-jobs
 */
export async function GET(req: NextRequest) {
  try {
    console.log('[TEST] Manual job processing trigger requested');
    
    const jobProcessorToken = process.env.JOB_PROCESSOR_TOKEN || 'default-job-token';
    const port = process.env.PORT || '3000';
    const baseUrl = `http://localhost:${port}`;
    
    console.log(`[TEST] Calling job processor at: ${baseUrl}/api/campaigns/process-jobs`);
    
    const response = await fetch(`${baseUrl}/api/campaigns/process-jobs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jobProcessorToken}`,
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(30000)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Job processor failed: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    
    return NextResponse.json({
      success: true,
      message: 'Job processing triggered successfully',
      result
    });
    
  } catch (error: any) {
    console.error('[TEST] Failed to trigger job processing:', error);
    
    return NextResponse.json({
      success: false,
      error: error.message,
      message: 'Failed to trigger job processing'
    }, { status: 500 });
  }
}
