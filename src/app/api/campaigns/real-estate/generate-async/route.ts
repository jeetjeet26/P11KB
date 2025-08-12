import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CampaignJobProcessor } from '@/lib/job-management/CampaignJobProcessor';

// Interface matching the existing synchronous endpoint
interface AsyncCampaignRequest {
  clientId: string;
  campaignType: string;
  adGroupType?: string;
  campaignName: string;
}

// Real Estate Campaign Types (copied from sync endpoint for validation)
const RE_CAMPAIGN_TYPES = {
  're_general_location': {
    name: 'Real Estate - General Location',
    description: 'Broad location-based campaigns with distributed headline focuses',
    requiresAdGroupFocus: false,
    adGroupFocuses: [
      'location_general',
      'location_specific', 
      'location_amenities'
    ]
  },
  're_unit_type': {
    name: 'Real Estate - Unit Type',
    description: 'Unit-specific campaigns focusing on bedrooms/bathrooms',
    requiresAdGroupFocus: true,
    adGroups: {
      'studio': 'Studio apartments',
      '1br': '1 bedroom units',
      '2br': '2 bedroom units',
      '3br': '3 bedroom units',
      '4br_plus': '4+ bedroom units'
    }
  },
  're_proximity': {
    name: 'Real Estate - Proximity Search',
    description: 'Location proximity campaigns with distributed headline focuses',
    requiresAdGroupFocus: false,
    adGroupFocuses: [
      'near_landmarks',
      'near_transit',
      'near_employers',
      'near_schools'
    ]
  }
} as const;

/**
 * Phase 2.1: New Async Generation Endpoint
 * Accept request, create job, return immediately with job ID
 */
export async function POST(req: NextRequest) {
  try {
    // Validate required environment variables
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return NextResponse.json({
        success: false,
        error: 'Server misconfiguration: Supabase URL or anon key missing.'
      }, { status: 503 });
    }

    const body: AsyncCampaignRequest = await req.json();
    const { 
      clientId, 
      campaignType, 
      adGroupType,
      campaignName
    } = body;

    // Validate required fields
    if (!clientId || !campaignType || !campaignName) {
      return NextResponse.json({ 
        success: false, 
        error: "Missing required fields: clientId, campaignType, campaignName" 
      }, { status: 400 });
    }

    // Validate campaign type
    if (!RE_CAMPAIGN_TYPES[campaignType]) {
      return NextResponse.json({ 
        success: false, 
        error: `Invalid campaign type. Must be one of: ${Object.keys(RE_CAMPAIGN_TYPES).join(', ')}` 
      }, { status: 400 });
    }

    // Check if adGroupType is required for this campaign type
    const campaignConfig = RE_CAMPAIGN_TYPES[campaignType];
    if (campaignConfig.requiresAdGroupFocus && !adGroupType) {
      return NextResponse.json({ 
        success: false, 
        error: `Ad group type is required for ${campaignType} campaigns` 
      }, { status: 400 });
    }

    // Validate ad group type only for campaigns that require it
    if (campaignConfig.requiresAdGroupFocus && adGroupType) {
      const validAdGroups = Object.keys(campaignConfig.adGroups);
      if (!validAdGroups.includes(adGroupType)) {
        return NextResponse.json({ 
          success: false, 
          error: `Invalid ad group type for ${campaignType}. Must be one of: ${validAdGroups.join(', ')}` 
        }, { status: 400 });
      }
    }

    const supabase = createClient();

    console.log(`[ASYNC-CAMPAIGN] Creating async job for client ${clientId}`);
    console.log(`[ASYNC-CAMPAIGN] Campaign: ${campaignName} | Type: ${campaignType} | Ad Group: ${adGroupType || 'distributed_focus'}`);

    // Verify client exists
    const { data: clientData, error: clientError } = await supabase
      .from('clients')
      .select('name')
      .eq('id', clientId)
      .single();

    if (clientError) {
      return NextResponse.json({ 
        success: false, 
        error: `Client not found: ${clientError.message}` 
      }, { status: 404 });
    }

    // Create job record in campaign_generation_jobs table
    const { data: job, error: jobError } = await supabase
      .from('campaign_generation_jobs')
      .insert({
        client_id: clientId,
        campaign_name: campaignName,
        campaign_type: campaignType,
        ad_group_type: adGroupType,
        status: 'pending',
        progress_step: 'queued',
        progress_percent: 0
      })
      .select()
      .single();

    if (jobError) {
      console.error('[ASYNC-CAMPAIGN] Failed to create job:', jobError);
      return NextResponse.json({ 
        success: false, 
        error: `Failed to create job: ${jobError.message}` 
      }, { status: 500 });
    }

    console.log(`[ASYNC-CAMPAIGN] Job created with ID: ${job.id}`);

    // Estimate duration based on campaign complexity
    const estimatedDuration = estimateGenerationDuration(campaignType, !!adGroupType);

    // Phase 3.3: Trigger background job processing
    console.log(`[ASYNC-CAMPAIGN] Job ${job.id} created, triggering background processor`);
    
    // Check if we're in development environment
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    if (isDevelopment) {
      // Local development: Process job directly to avoid HTTP call issues
      console.log(`[ASYNC-CAMPAIGN] Local development detected, processing job directly`);
      processJobDirectly(job.id).catch(error => {
        console.warn(`[ASYNC-CAMPAIGN] Failed to process job directly for job ${job.id}:`, error);
        // Job will remain in pending state for manual retry
      });
    } else {
      // Production: Use HTTP trigger for background processing
      triggerBackgroundJobProcessor().catch(error => {
        console.warn(`[ASYNC-CAMPAIGN] Failed to trigger background processor for job ${job.id}:`, error);
        // Don't fail the request - the job will be picked up by scheduled processor
      });
    }
    
    console.log(`[ASYNC-CAMPAIGN] Job ${job.id} queued for processing`);
    console.log(`[ASYNC-CAMPAIGN] Estimated duration: ${estimatedDuration}`);

    // Phase 2.1 Response Structure as specified in timeout.md
    return NextResponse.json({
      success: true,
      jobId: job.id,
      estimatedDuration,
      status: 'pending',
      message: 'Campaign generation job created successfully. Processing will begin shortly.',
      pollingEndpoint: `/api/campaigns/jobs/${job.id}`,
      realTimeChannel: 'campaign-jobs'
    });

  } catch (error: any) {
    console.error("Async campaign job creation failed:", error);
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}

/**
 * Estimate generation duration based on campaign complexity
 */
function estimateGenerationDuration(campaignType: string, hasAdGroupType: boolean): string {
  // Base durations in minutes
  let baseMinutes = 2;
  
  // Proximity campaigns take longer due to Google Maps integration
  if (campaignType === 're_proximity') {
    baseMinutes += 1;
  }
  
  // Unit type campaigns with specific ad groups take slightly longer
  if (hasAdGroupType) {
    baseMinutes += 0.5;
  }
  
  const maxMinutes = baseMinutes + 1;
  
  return `${baseMinutes}-${maxMinutes} minutes`;
}

/**
 * Local Development: Process job directly without HTTP calls
 * This avoids the localhost HTTP call issues in development
 */
async function processJobDirectly(jobId: string): Promise<void> {
  try {
    console.log(`[ASYNC-CAMPAIGN] Processing job ${jobId} directly in development mode`);
    
    const processor = new CampaignJobProcessor();
    await processor.processJob(jobId);
    
    console.log(`[ASYNC-CAMPAIGN] Job ${jobId} processed successfully`);
  } catch (error) {
    console.error(`[ASYNC-CAMPAIGN] Failed to process job ${jobId} directly:`, error);
    throw error;
  }
}

/**
 * Phase 3.3: Trigger Background Job Processor
 * Makes an async call to the job processing endpoint
 */
async function triggerBackgroundJobProcessor(): Promise<void> {
  try {
    const jobProcessorToken = process.env.JOB_PROCESSOR_TOKEN || 'default-job-token';
    
    // Better URL detection for local development
    let baseUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!baseUrl) {
      // Local development fallback
      const port = process.env.PORT || '3000';
      baseUrl = `http://localhost:${port}`;
      console.log(`[ASYNC-CAMPAIGN] Using local development URL: ${baseUrl}`);
    }
    
    console.log(`[ASYNC-CAMPAIGN] Triggering background processor at: ${baseUrl}/api/campaigns/process-jobs`);
    
    // Make async call to job processor endpoint
    const response = await fetch(`${baseUrl}/api/campaigns/process-jobs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jobProcessorToken}`,
        'Content-Type': 'application/json'
      },
      // Set a reasonable timeout to avoid hanging
      signal: AbortSignal.timeout(30000) // 30 second timeout
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Job processor responded with status ${response.status}: ${errorText}`);
    }
    
    const result = await response.json();
    console.log(`[ASYNC-CAMPAIGN] Background processor triggered successfully:`, result.message);
    
  } catch (error) {
    console.error(`[ASYNC-CAMPAIGN] Failed to trigger background processor:`, error);
    // Don't throw - this shouldn't fail the job creation
    // The job will be picked up by the next scheduled run
  }
}
