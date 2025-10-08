import { NextRequest, NextResponse } from 'next/server';
import { CampaignJobProcessor } from '@/lib/job-management/CampaignJobProcessor';

/**
 * Phase 3.2: Background Job Processing Endpoint
 * 
 * This endpoint can be called by:
 * 1. Scheduled cron jobs (every minute)
 * 2. Manual triggers for testing
 * 3. Webhook triggers from external systems
 * 
 * It processes all pending campaign generation jobs
 */

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  
  try {
    console.log(`[JOB_PROCESSOR_API] ========== BACKGROUND JOB PROCESSING STARTED ==========`);
    
    // Validate authorization (simple API key check)
    const authHeader = req.headers.get('authorization');
    const expectedToken = process.env.JOB_PROCESSOR_TOKEN || 'default-job-token';
    
    if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
      console.warn(`[JOB_PROCESSOR_API] Unauthorized job processing attempt`);
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 });
    }

    // Create processor instance
    const processor = new CampaignJobProcessor();
    
    // Process all pending jobs
    await processor.processAllPendingJobs();
    
    const processingTime = Date.now() - startTime;
    
    console.log(`[JOB_PROCESSOR_API] ========== BACKGROUND JOB PROCESSING COMPLETED ==========`);
    console.log(`[JOB_PROCESSOR_API] Total processing time: ${processingTime}ms`);
    
    return NextResponse.json({
      success: true,
      message: 'Background job processing completed',
      processingTimeMs: processingTime,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error(`[JOB_PROCESSOR_API] Background job processing failed:`, error);
    
    return NextResponse.json({
      success: false,
      error: error.message,
      processingTimeMs: Date.now() - startTime
    }, { status: 500 });
  }
}

/**
 * GET endpoint for health checks and status
 */
export async function GET(req: NextRequest) {
  try {
    console.log(`[JOB_PROCESSOR_API] Health check requested`);
    
    // Basic environment validation
    const requiredEnvVars = [
      'OPENAI_API_KEY',
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY'
    ];
    
    const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
    
    if (missingEnvVars.length > 0) {
      return NextResponse.json({
        status: 'unhealthy',
        error: `Missing required environment variables: ${missingEnvVars.join(', ')}`,
        timestamp: new Date().toISOString()
      }, { status: 503 });
    }
    
    return NextResponse.json({
      status: 'healthy',
      message: 'Job processor is ready',
      environment: {
        hasOpenAI: !!process.env.OPENAI_API_KEY,
        hasSupabase: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasJobToken: !!process.env.JOB_PROCESSOR_TOKEN,
        hasGoogleMaps: !!process.env.GOOGLE_MAPS_API_KEY
      },
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error(`[JOB_PROCESSOR_API] Health check failed:`, error);
    
    return NextResponse.json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
