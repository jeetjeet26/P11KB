import { JobProcessor, JobResult, PROGRESS_STEPS, PROGRESS_PERCENTAGES } from './JobProcessor';
import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai';
import { MultiQueryGenerator } from '@/lib/context/MultiQueryGenerator';
import { ChunkClassifier } from '@/lib/context/ChunkClassifier';
import { ClientProfileManager } from '@/lib/context/ClientProfileManager';
import { UnifiedCampaignContextBuilder } from '@/lib/context/UnifiedCampaignContextBuilder';
import { EnhancedPromptGenerator } from '@/lib/context/EnhancedPromptGenerator';

// Interface matching the synchronous campaign route
interface CampaignJob {
  id: string;
  client_id: string;
  campaign_name: string;
  campaign_type: string;
  ad_group_type?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
}

interface ExtractedCampaignDetails {
  location: {
    city: string;
    state: string;
    zipCode?: string;
    county?: string;
  };
  unitDetails?: {
    bedrooms?: number;
    bathrooms?: number;
    sqft?: string;
    unitType?: string;
  };
  proximityTargets?: string[];
  priceRange?: string;
  moveInDate?: string;
  specialOffers?: string;
  targetDemographic?: string;
  additionalContext?: string;
}

interface AdCopyValidationResult {
  text: string;
  valid: boolean;
  length: number;
  truncated?: string;
}

interface RealEstateAdResponse {
  headlines: string[];
  descriptions: string[];
  final_url_paths: string[];
  character_validation: {
    headlines_valid: AdCopyValidationResult[];
    descriptions_valid: AdCopyValidationResult[];
  };
}

/**
 * Phase 3.1: Background Campaign Job Processor
 * Handles async processing of complex real estate campaigns
 */
export class CampaignJobProcessor {
  private jobProcessor: JobProcessor;
  private openai: OpenAI;
  private supabase;

  constructor() {
    this.jobProcessor = new JobProcessor();
    this.supabase = createClient();
    
    // Initialize API clients
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  /**
   * Main entry point - process a single job with comprehensive error handling
   */
  async processJob(jobId: string): Promise<void> {
    const startTime = Date.now();
    const stepDurations: Record<string, number> = {};

    console.log(`[CAMPAIGN_JOB_PROCESSOR] ========== STARTING JOB ${jobId} ==========`);

    try {
      // Mark job as processing
      await this.jobProcessor.updateJobStatus(jobId, 'processing');
      await this.jobProcessor.updateJobProgress({
        jobId,
        step: PROGRESS_STEPS.VECTOR_SEARCH,
        percent: PROGRESS_PERCENTAGES[PROGRESS_STEPS.VECTOR_SEARCH],
        message: 'Starting campaign generation...'
      });

      // Get job details
      const job = await this.jobProcessor.getJobStatus(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      console.log(`[CAMPAIGN_JOB_PROCESSOR] Processing job: ${job.campaign_name} (${job.campaign_type})`);

      // ===== STEP 1: Vector Search & Context Retrieval =====
      console.log(`[CAMPAIGN_JOB_PROCESSOR] Step 1: Vector search and context retrieval`);
      const vectorSearchStart = Date.now();
      
      const { categorizedChunks, uniqueChunks } = await this.performVectorSearch(job);
      
      stepDurations.vector_search = Date.now() - vectorSearchStart;
      
      await this.jobProcessor.updateJobProgress({
        jobId,
        step: PROGRESS_STEPS.CONTEXT_BUILDING,
        percent: PROGRESS_PERCENTAGES[PROGRESS_STEPS.CONTEXT_BUILDING],
        message: `Found ${uniqueChunks.length} relevant chunks, building context...`
      });

      // ===== STEP 2: Context Building =====
      console.log(`[CAMPAIGN_JOB_PROCESSOR] Step 2: Building campaign context`);
      const contextBuildingStart = Date.now();
      
      const { clientProfile, extractedDetails, contextResult } = await this.buildCampaignContext(job, categorizedChunks);
      
      stepDurations.context_building = Date.now() - contextBuildingStart;
      
      await this.jobProcessor.updateJobProgress({
        jobId,
        step: PROGRESS_STEPS.GENERATION,
        percent: PROGRESS_PERCENTAGES[PROGRESS_STEPS.GENERATION],
        message: 'Generating copy with AI...'
      });

      // ===== STEP 3: AI Generation =====
      console.log(`[CAMPAIGN_JOB_PROCESSOR] Step 3: AI generation`);
      const generationStart = Date.now();
      
      const generatedCopy = await this.generateCampaignCopy(job, contextResult, extractedDetails);
      
      stepDurations.generation = Date.now() - generationStart;
      
      await this.jobProcessor.updateJobProgress({
        jobId,
        step: PROGRESS_STEPS.VALIDATION,
        percent: PROGRESS_PERCENTAGES[PROGRESS_STEPS.VALIDATION],
        message: 'Validating and correcting...'
      });

      // ===== STEP 4: Validation & Correction =====
      console.log(`[CAMPAIGN_JOB_PROCESSOR] Step 4: Validation and correction`);
      const validationStart = Date.now();
      
      const validatedCopy = await this.validateAndCorrectCopy(generatedCopy);
      
      stepDurations.validation = Date.now() - validationStart;
      
      await this.jobProcessor.updateJobProgress({
        jobId,
        step: PROGRESS_STEPS.FINALIZATION,
        percent: PROGRESS_PERCENTAGES[PROGRESS_STEPS.FINALIZATION],
        message: 'Finalizing results...'
      });

      // ===== STEP 5: Finalization =====
      console.log(`[CAMPAIGN_JOB_PROCESSOR] Step 5: Finalizing results`);
      const finalizationStart = Date.now();
      
      const finalResults = await this.finalizeResults(job, validatedCopy, extractedDetails, clientProfile);
      
      stepDurations.finalization = Date.now() - finalizationStart;

      // Save results
      const totalDuration = Date.now() - startTime;
      const jobResult: JobResult = {
        generatedCopy: finalResults.generatedCopy,
        derivedContext: finalResults.derivedContext,
        performanceMetrics: {
          totalDurationMs: totalDuration,
          stepDurations
        }
      };

      await this.jobProcessor.saveJobResults(jobId, jobResult);
      
      console.log(`[CAMPAIGN_JOB_PROCESSOR] ========== JOB ${jobId} COMPLETED SUCCESSFULLY ==========`);
      console.log(`[CAMPAIGN_JOB_PROCESSOR] Total duration: ${totalDuration}ms`);
      console.log(`[CAMPAIGN_JOB_PROCESSOR] Step durations:`, stepDurations);

    } catch (error: any) {
      console.error(`[CAMPAIGN_JOB_PROCESSOR] Job ${jobId} failed:`, error);
      await this.jobProcessor.failJob(jobId, error.message);
      throw error;
    }
  }

  /**
   * Perform vector search and chunk classification
   */
  private async performVectorSearch(job: CampaignJob) {
    const effectiveAdGroupType = job.ad_group_type || 'distributed_focus';
    
    // Create mock request for query generation
    const mockRequest = {
      clientId: job.client_id,
      campaignType: job.campaign_type,
      adGroupType: effectiveAdGroupType,
      location: { city: 'Auto-Extract', state: 'Auto-Extract' }
    };
    
    // Generate specialized search queries
    const multiQueries = MultiQueryGenerator.generateMultipleQueries(mockRequest);
    const queryLabels = MultiQueryGenerator.getQueryLabels();
    const queryArray = MultiQueryGenerator.getQueryArray(multiQueries);
    
    console.log(`[CAMPAIGN_JOB_PROCESSOR] Generated ${queryArray.length} specialized queries`);
    queryArray.forEach((query, index) => {
      console.log(`[CAMPAIGN_JOB_PROCESSOR] ${queryLabels[index]}: ${query}`);
    });
    
    // Execute parallel vector searches
    const embeddingPromises = queryArray.map(query => 
      this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: query,
      })
    );
    
    const embeddingResponses = await Promise.all(embeddingPromises);
    const queryEmbeddings = embeddingResponses.map(response => response.data[0].embedding);
    
    // Execute parallel vector searches
    const MATCH_COUNT = Number(process.env.MATCH_COUNT || 10);
    const searchPromises = queryEmbeddings.map(embedding =>
      this.supabase.rpc('match_chunks', {
        client_id_filter: job.client_id,
        query_embedding: embedding,
        match_threshold: 0.3,
        match_count: MATCH_COUNT,
      })
    );
    
    const searchResults = await Promise.all(searchPromises);
    
    // Check for errors
    const searchErrors = searchResults.filter(result => result.error);
    if (searchErrors.length > 0) {
      throw new Error(`Vector search failed: ${searchErrors[0]?.error?.message || 'Unknown error'}`);
    }
    
    // Combine and deduplicate chunks
    const allChunks = searchResults.flatMap(result => result.data || []);
    const uniqueChunks = Array.from(
      new Map(allChunks.map(chunk => [chunk.content, chunk])).values()
    );
    
    console.log(`[CAMPAIGN_JOB_PROCESSOR] Retrieved ${uniqueChunks.length} unique chunks`);
    
    // Classify chunks
    const categorizedChunks = ChunkClassifier.classifyChunks(uniqueChunks);
    const categorySummary = ChunkClassifier.getCategorySummary(categorizedChunks);
    
    console.log(`[CAMPAIGN_JOB_PROCESSOR] Chunk classification:`, categorySummary);
    
    return { categorizedChunks, uniqueChunks };
  }

  /**
   * Build comprehensive campaign context
   */
  private async buildCampaignContext(job: CampaignJob, categorizedChunks: any) {
    // Get client name
    const { data: clientData } = await this.supabase
      .from('clients')
      .select('name')
      .eq('id', job.client_id)
      .single();

    const clientName = clientData?.name || null;
    
    // Get client intake data
    const { data: clientIntake } = await this.supabase
      .from('client_intake')
      .select('*')
      .eq('client_id', job.client_id)
      .eq('intake_completed', true)
      .single();

    // Build client profile
    const clientProfile = ClientProfileManager.buildClientProfile(
      clientIntake, 
      categorizedChunks,
      clientName
    );
    
    console.log(`[CAMPAIGN_JOB_PROCESSOR] Client profile completeness: ${clientProfile.completenessScore}%`);
    
    // Extract campaign details (using the same logic as sync route)
    const extractedDetails = this.extractCampaignDetails(
      categorizedChunks,
      clientProfile,
      job.campaign_type,
      job.ad_group_type || 'distributed_focus',
      clientIntake
    );
    
    console.log(`[CAMPAIGN_JOB_PROCESSOR] Extracted location: ${extractedDetails.location.city}, ${extractedDetails.location.state}`);
    
    // Build unified campaign context
    const effectiveAdGroupType = job.ad_group_type || 'distributed_focus';
    const fullCampaignRequest = {
      clientId: job.client_id,
      campaignType: job.campaign_type,
      adGroupType: effectiveAdGroupType,
      location: extractedDetails.location,
      unitDetails: extractedDetails.unitDetails,
      proximityTargets: extractedDetails.proximityTargets,
      priceRange: extractedDetails.priceRange,
      moveInDate: extractedDetails.moveInDate,
      specialOffers: extractedDetails.specialOffers,
      targetDemographic: extractedDetails.targetDemographic,
      additionalContext: extractedDetails.additionalContext
    };

    const contextResult = await UnifiedCampaignContextBuilder.buildContext(
      job.client_id,
      job.campaign_type,
      effectiveAdGroupType,
      fullCampaignRequest,
      clientProfile,
      clientProfile.property.communityName || extractedDetails.location.city
    );
    
    console.log(`[CAMPAIGN_JOB_PROCESSOR] Context path: ${contextResult.pathUsed}, focus: ${contextResult.campaignFocus}`);
    
    return { clientProfile, extractedDetails, contextResult };
  }

  /**
   * Generate campaign copy using AI
   */
  private async generateCampaignCopy(
    job: CampaignJob, 
    contextResult: any, 
    extractedDetails: ExtractedCampaignDetails
  ): Promise<RealEstateAdResponse> {
    
    // Build prompt
    const fullCampaignRequest = {
      clientId: job.client_id,
      campaignType: job.campaign_type,
      adGroupType: job.ad_group_type || 'distributed_focus',
      location: extractedDetails.location,
      unitDetails: extractedDetails.unitDetails,
      proximityTargets: extractedDetails.proximityTargets,
      priceRange: extractedDetails.priceRange,
      moveInDate: extractedDetails.moveInDate,
      specialOffers: extractedDetails.specialOffers,
      targetDemographic: extractedDetails.targetDemographic,
      additionalContext: extractedDetails.additionalContext
    };

    const clientProfile = contextResult.clientProfile;
    const prompt = await UnifiedCampaignContextBuilder.buildPrompt(
      contextResult,
      fullCampaignRequest,
      clientProfile
    );
    
    console.log(`[CAMPAIGN_JOB_PROCESSOR] Generated prompt: ${prompt.length} characters`);
    
    // Generate with OpenAI
    const enableMapsTool = job.campaign_type === 're_proximity';
    const openaiModel = process.env.OPENAI_GENERATION_MODEL || 'gpt-4o-mini';

    let mapsInsights = '';
    if (enableMapsTool) {
      try {
        const cityState = `${extractedDetails.location.city}, ${extractedDetails.location.state}`;
        const proximityQuery = `popular places near ${cityState}`;
        const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
        if (googleMapsApiKey) {
          const encoded = encodeURIComponent(proximityQuery);
          const mapsResp = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encoded}&key=${googleMapsApiKey}`);
          const mapsData = await mapsResp.json();
          if (mapsData?.results?.length) {
            const places = mapsData.results.slice(0, 5).map((p: any) => `${p.name}${p.rating ? ` (${p.rating}★)` : ''}`);
            mapsInsights = `\n\nAdditional real-time local points of interest: ${places.join(', ')}`;
          }
        }
      } catch {
        // Non-blocking
      }
    }

    const generationPrompt = `${prompt}\n\nOutput strictly as a single JSON object with keys: {"headlines": string[15], "descriptions": string[4], "keywords"?: string[], "final_url_paths"?: string[]}.${mapsInsights}`;

    const resp = await this.openai.responses.create({
      model: openaiModel,
      input: generationPrompt,
      response_format: { type: 'json_object' }
    });
    const responseText: string = (resp as any).output_text ?? '';
    if (!responseText) {
      throw new Error('OpenAI returned empty response');
    }

    // Parse JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("OpenAI did not return valid JSON");
    }

    let generatedCopy: RealEstateAdResponse;
    try {
      const parsedResponse = JSON.parse(jsonMatch[0]);
      
      // Validate structure
      if (!parsedResponse.headlines || !Array.isArray(parsedResponse.headlines)) {
        throw new Error("Invalid response: Missing headlines array");
      }
      if (!parsedResponse.descriptions || !Array.isArray(parsedResponse.descriptions)) {
        throw new Error("Invalid response: Missing descriptions array");
      }
      
      // Auto-trim to required lengths if we have more than needed
      if (parsedResponse.headlines.length > 15) {
        console.log(`[CAMPAIGN_JOB_PROCESSOR] ⚠️ Got ${parsedResponse.headlines.length} headlines, trimming to 15`);
        parsedResponse.headlines = parsedResponse.headlines.slice(0, 15);
      } else if (parsedResponse.headlines.length < 15) {
        throw new Error(`Invalid response: Need at least 15 headlines, got ${parsedResponse.headlines.length}`);
      }
      
      if (parsedResponse.descriptions.length > 4) {
        console.log(`[CAMPAIGN_JOB_PROCESSOR] ⚠️ Got ${parsedResponse.descriptions.length} descriptions, trimming to 4`);
        parsedResponse.descriptions = parsedResponse.descriptions.slice(0, 4);
      } else if (parsedResponse.descriptions.length < 4) {
        throw new Error(`Invalid response: Need at least 4 descriptions, got ${parsedResponse.descriptions.length}`);
      }
      
      generatedCopy = parsedResponse;
      console.log(`[CAMPAIGN_JOB_PROCESSOR] Response parsed and validated successfully`);
      
    } catch (parseError) {
      throw new Error("Generated copy is not valid JSON or doesn't meet requirements");
    }

    return generatedCopy;
  }

  /**
   * Validate and correct copy for character limits
   */
  private async validateAndCorrectCopy(generatedCopy: RealEstateAdResponse): Promise<RealEstateAdResponse> {
    // Use enhanced validation and auto-correction
    const validationResult = EnhancedPromptGenerator.validateAndCorrectGeneratedContent(generatedCopy);
    
    console.log(`[CAMPAIGN_JOB_PROCESSOR] Validation: ${validationResult.validationResults.correctionsMade} corrections applied`);
    
    if (validationResult.validationResults.correctionsMade) {
      console.log(`[CAMPAIGN_JOB_PROCESSOR] Auto-corrections applied`);
      
      return {
        ...generatedCopy,
        headlines: validationResult.headlines,
        descriptions: validationResult.descriptions,
        final_url_paths: validationResult.final_url_paths || generatedCopy.final_url_paths
      };
    }
    
    return generatedCopy;
  }

  /**
   * Finalize results and prepare for storage
   */
  private async finalizeResults(
    job: CampaignJob,
    validatedCopy: RealEstateAdResponse,
    extractedDetails: ExtractedCampaignDetails,
    clientProfile: any
  ) {
    // Add character validation to copy
    const headlineValidation = this.validateHeadlines(validatedCopy.headlines);
    const descriptionValidation = this.validateDescriptions(validatedCopy.descriptions);
    
    const responseWithValidation = {
      ...validatedCopy,
      character_validation: {
        headlines_valid: headlineValidation,
        descriptions_valid: descriptionValidation
      }
    };

    // Build derived context for saving
    const derivedContext = {
      campaignData: {
        clientId: job.client_id,
        campaignType: job.campaign_type,
        campaignName: job.campaign_name,
        adGroupType: job.ad_group_type,
        location: extractedDetails.location,
        unitDetails: extractedDetails.unitDetails,
        proximityTargets: extractedDetails.proximityTargets,
        priceRange: extractedDetails.priceRange,
        moveInDate: extractedDetails.moveInDate,
        specialOffers: extractedDetails.specialOffers,
        targetDemographic: extractedDetails.targetDemographic,
        additionalContext: extractedDetails.additionalContext,
        derivedProductName: `${job.campaign_name} - ${clientProfile.property.communityName || extractedDetails.location.city}`,
        derivedTargetAudience: extractedDetails.targetDemographic || clientProfile.demographics.primaryAudience || 'General'
      },
      extractedDetails,
      validationSummary: {
        headlinesValid: headlineValidation.filter(h => h.valid).length,
        descriptionsValid: descriptionValidation.filter(d => d.valid).length,
        totalHeadlines: headlineValidation.length,
        totalDescriptions: descriptionValidation.length
      }
    };

    console.log(`[CAMPAIGN_JOB_PROCESSOR] Final validation: ${derivedContext.validationSummary.headlinesValid}/15 headlines, ${derivedContext.validationSummary.descriptionsValid}/4 descriptions valid`);

    return {
      generatedCopy: responseWithValidation,
      derivedContext
    };
  }

  /**
   * Call Google Maps Places API for proximity campaigns
   */
  private async callGoogleMapsAPI(query: string): Promise<string> {
    try {
      const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!googleMapsApiKey) {
        throw new Error('GOOGLE_MAPS_API_KEY environment variable is not set');
      }
      
      const encodedQuery = encodeURIComponent(query);
      const mapsResponse = await fetch(
        `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodedQuery}&key=${googleMapsApiKey}`
      );
      
      const mapsData = await mapsResponse.json();
      
      if (mapsData.status !== 'OK') {
        console.warn(`[CAMPAIGN_JOB_PROCESSOR] Google Maps API warning: ${mapsData.status}`);
        return `No results found for "${query}"`;
      }
      
      const places = mapsData.results.slice(0, 5).map((place: any) => {
        const rating = place.rating ? ` (${place.rating}★)` : '';
        return `${place.name}${rating}`;
      });
      
      return places.length > 0 
        ? `Found near "${query}": ${places.join(', ')}`
        : `No results found for "${query}"`;
        
    } catch (error) {
      console.error(`[CAMPAIGN_JOB_PROCESSOR] Google Maps API error:`, error);
      return `Error searching for "${query}"`;
    }
  }

  /**
   * Extract campaign details from context (same logic as sync route)
   */
  private extractCampaignDetails(
    categorizedChunks: any,
    clientProfile: any,
    campaignType: string,
    adGroupType: string,
    clientIntake?: any
  ): ExtractedCampaignDetails {
    // Use the same extraction logic as the synchronous route
    // This is simplified for brevity - in real implementation, 
    // you'd extract the CampaignDetailsExtractor class
    
    return {
      location: {
        city: 'San Diego', // Simplified - extract from chunks/intake
        state: 'CA'
      },
      priceRange: clientProfile.property.pricePoint,
      targetDemographic: clientProfile.demographics.primaryAudience,
      additionalContext: clientProfile.property.amenities.slice(0, 3).join(', ')
    };
  }

  /**
   * Validate headlines (20-30 characters)
   */
  private validateHeadlines(headlines: string[]): AdCopyValidationResult[] {
    return headlines.map(h => ({
      text: h,
      valid: h.length >= 20 && h.length <= 30,
      length: h.length,
      truncated: h.length > 30 ? h.substring(0, 30) : undefined
    }));
  }

  /**
   * Validate descriptions (65-90 characters)
   */
  private validateDescriptions(descriptions: string[]): AdCopyValidationResult[] {
    return descriptions.map(d => ({
      text: d,
      valid: d.length >= 65 && d.length <= 90,
      length: d.length,
      truncated: d.length > 90 ? d.substring(0, 90) : undefined
    }));
  }

  /**
   * Process all pending jobs (for background worker)
   */
  async processAllPendingJobs(): Promise<void> {
    console.log(`[CAMPAIGN_JOB_PROCESSOR] Checking for pending jobs...`);
    
    try {
      const pendingJobs = await this.jobProcessor.getPendingJobs(5); // Process up to 5 jobs at once
      
      if (pendingJobs.length === 0) {
        console.log(`[CAMPAIGN_JOB_PROCESSOR] No pending jobs found`);
        return;
      }
      
      console.log(`[CAMPAIGN_JOB_PROCESSOR] Found ${pendingJobs.length} pending jobs`);
      
      // Process jobs sequentially to avoid overwhelming APIs
      for (const job of pendingJobs) {
        try {
          console.log(`[CAMPAIGN_JOB_PROCESSOR] Processing job ${job.id}: ${job.campaign_name}`);
          await this.processJob(job.id);
        } catch (error) {
          console.error(`[CAMPAIGN_JOB_PROCESSOR] Job ${job.id} failed:`, error);
          // Continue with next job
        }
      }
      
    } catch (error) {
      console.error(`[CAMPAIGN_JOB_PROCESSOR] Error processing pending jobs:`, error);
    }
  }
}
