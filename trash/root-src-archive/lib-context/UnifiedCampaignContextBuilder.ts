import { createClient } from '@/lib/supabase/server';
import { 
  StructuredClientProfile, 
  ClientIntakeData 
} from './ClientProfileManager';
import { 
  StructuredCampaignContext, 
  CampaignContextSection,
  EnhancedContextBuilder,
  GeminiContext 
} from './CampaignContextBuilder';

// ===== UNIFIED CAMPAIGN CONTEXT BUILDER =====

/**
 * Unified Campaign Context Builder
 * 
 * Builds campaign context using ONLY dual chunking system:
 * 1. Checks if dual chunking data is available (chunk_type='llm_dual')
 * 2. Uses enhanced path with atomic ingredients + narrative chunks
 * 3. FAILS if dual chunking data is not available (no fallback)
 * 4. Returns consistent GeminiContext format
 * 
 * Traditional context mode has been REMOVED - system requires dual chunking.
 */
export class UnifiedCampaignContextBuilder {

  /**
   * Main entry point - builds context using ONLY dual chunking (no fallback)
   */
  static async buildContext(
    clientId: string,
    campaignType: string,
    adGroupType: string,
    campaignRequest: any,
    clientProfile: StructuredClientProfile,
    communityName?: string
  ): Promise<{
    context: StructuredCampaignContext | GeminiContext;
    hasDualChunking: boolean;
    pathUsed: 'enhanced' | 'standard';
    campaignFocus?: string;
  }> {
    
    console.log(`[UNIFIED_CONTEXT] Building context for client ${clientId}, campaign: ${campaignType}, adGroup: ${adGroupType}`);
    
    // Step 1: Check for dual chunking data availability
    const dualChunkingAvailable = await this.checkDualChunkingAvailability(clientId);
    
    if (!dualChunkingAvailable) {
      console.error(`[UNIFIED_CONTEXT] ❌ NO DUAL CHUNKING DATA FOUND`);
      console.error(`[UNIFIED_CONTEXT] Client must have chunks with chunk_type='llm_dual'`);
      console.error(`[UNIFIED_CONTEXT] Please crawl the client's website to generate chunks`);
      throw new Error(
        `No dual chunking data available for client ${clientId}. ` +
        `Please crawl the client's website first to generate atomic and narrative chunks. ` +
        `The system requires chunks with chunk_type='llm_dual' to generate ad copy.`
      );
    }
    
    console.log(`[UNIFIED_CONTEXT] ✅ Dual chunking data found - using ENHANCED path`);
    
    // Enhanced path: Use atomic ingredients + narrative chunks (ONLY path now)
    const campaignFocus = this.determineCampaignFocus(campaignType, adGroupType);
    const enhancedContext = await this.buildEnhancedContext(
      clientId,
      communityName || campaignRequest.location?.city || 'Unknown',
      campaignFocus
    );
    
    return {
      context: enhancedContext,
      hasDualChunking: true,
      pathUsed: 'enhanced',
      campaignFocus
    };
  }

  /**
   * Check if client has dual chunking data (atomic + narrative chunks)
   * Uses new unified schema with chunk_subtype for all sources
   */
  private static async checkDualChunkingAvailability(clientId: string): Promise<boolean> {
    try {
      console.log(`[UNIFIED_CONTEXT] ========== CHECKING DUAL CHUNKING AVAILABILITY ==========`);
      console.log(`[UNIFIED_CONTEXT] Client ID: ${clientId}`);
      
      const supabase = createClient();
      
      // Simplified query using new unified schema
      // All sources now use chunk_subtype consistently
      console.log(`[UNIFIED_CONTEXT] Executing availability check query...`);
      const { data: dualChunkingData, error } = await supabase
        .from('chunks')
        .select('chunk_subtype, atomic_category, source_type, source_url, page_type, document_type')
        .eq('client_id', clientId)
        .eq('chunk_type', 'llm_dual')
        .or('chunk_subtype.like.atomic_%,chunk_subtype.like.narrative_%')
        .limit(10);
      
      console.log(`[UNIFIED_CONTEXT] Availability check query executed`);
      console.log(`[UNIFIED_CONTEXT] Error:`, error ? JSON.stringify(error, null, 2) : 'none');
      console.log(`[UNIFIED_CONTEXT] Result count: ${dualChunkingData?.length || 0}`);
      
      const hasData = !error && dualChunkingData && dualChunkingData.length > 0;
      console.log(`[UNIFIED_CONTEXT] Dual chunking availability: ${hasData ? 'Available' : 'Not available'}`);
      
      if (hasData) {
        const webChunks = dualChunkingData.filter((c: any) => c.source_type === 'web');
        const docChunks = dualChunkingData.filter((c: any) => c.source_type === 'document');
        
        console.log(`[UNIFIED_CONTEXT] Found ${dualChunkingData.length} dual chunking records`);
        console.log(`[UNIFIED_CONTEXT] - Document chunks: ${docChunks.length}`);
        console.log(`[UNIFIED_CONTEXT] - Web content chunks: ${webChunks.length}`);
        console.log(`[UNIFIED_CONTEXT] Chunk subtypes:`, dualChunkingData.map((c: any) => c.chunk_subtype));
        
        if (webChunks.length > 0) {
          const pageTypes = Array.from(new Set(webChunks.map((c: any) => c.page_type).filter(Boolean)));
          console.log(`[UNIFIED_CONTEXT] - Web page types: ${pageTypes.join(', ')}`);
        }
      }
      
      return hasData;
      
    } catch (error) {
      console.warn(`[UNIFIED_CONTEXT] Error checking dual chunking availability:`, error);
      return false;
    }
  }

  /**
   * Build enhanced context using dual chunking system
   */
  private static async buildEnhancedContext(
    clientId: string,
    communityName: string,
    campaignFocus: string
  ): Promise<GeminiContext> {
    
    console.log(`[UNIFIED_CONTEXT] Building enhanced context with focus: ${campaignFocus}`);
    
    try {
      // Use the existing EnhancedContextBuilder logic
      const enhancedContext = await EnhancedContextBuilder.buildGeminiContext(
        communityName,
        campaignFocus,
        clientId
      );
      
      console.log(`[UNIFIED_CONTEXT] Enhanced context built successfully`);
      console.log(`[UNIFIED_CONTEXT] - Atomic ingredients: ${Object.values(enhancedContext.atomicIngredients).flat().length}`);
      console.log(`[UNIFIED_CONTEXT] - Narrative chunks: ${enhancedContext.narrativeContext.length}`);
      
      return enhancedContext;
      
    } catch (error) {
      console.error(`[UNIFIED_CONTEXT] Failed to build enhanced context:`, error);
      throw new Error(`Enhanced context building failed: ${error}`);
    }
  }

  /**
   * Build standard context - REMOVED
   * System now requires dual chunking, no fallback to traditional mode
   */
  private static async buildStandardContext(
    campaignRequest: any,
    clientProfile: StructuredClientProfile
  ): Promise<StructuredCampaignContext> {
    throw new Error(
      'Traditional context mode has been removed. ' +
      'System requires dual chunking data (chunk_type=llm_dual). ' +
      'Please crawl the client\'s website to generate chunks.'
    );
  }

  /**
   * Determine campaign focus based on campaign type and ad group
   * (Consolidated from MultifamilyContextBuilder logic)
   */
  private static determineCampaignFocus(campaignType: string, adGroupType?: string): string {
    // Map campaign types to focus areas for dual chunking retrieval
    switch (campaignType) {
      case 're_proximity':
        return 'location_benefits';  // Focus on Google Maps data and nearby locations
      
      case 're_unit_type':
        // Different focuses based on unit type
        if (adGroupType === 'studio' || adGroupType === '1br') {
          return 'value_pricing';
        } else if (adGroupType === '2br' || adGroupType === '3br' || adGroupType === '4br_plus') {
          return 'luxury_amenities';
        }
        return 'general_focus';
      
      case 're_general_location':
        return 'luxury_amenities';  // Focus on community name, amenities, and lifestyle features
      
      default:
        return 'general_focus';
    }
  }

  /**
   * Get campaign focus mapping for targeting specific atomic categories and narrative types
   * (Consolidated from MultifamilyContextBuilder logic)
   */
  static getCampaignFocusMapping() {
    return {
      'luxury_amenities': {
        atomic_categories: ['amenity', 'lifestyle'],
        narrative_types: ['narrative_amenities', 'narrative_lifestyle', 'narrative_community'],
        priority: 'community'
      },
      'location_benefits': {
        atomic_categories: [], // Proximity campaigns rely on Google Maps, minimal atomic chunks
        narrative_types: ['narrative_location', 'narrative_amenities'],
        priority: 'location'
      },
      'value_pricing': {
        atomic_categories: ['pricing', 'feature', 'special'],
        narrative_types: ['narrative_community', 'narrative_pricing'],
        priority: 'value'
      },
      'general_focus': {
        atomic_categories: ['amenity', 'lifestyle'],
        narrative_types: ['narrative_amenities', 'narrative_location', 'narrative_lifestyle', 'narrative_community'],
        priority: 'general'
      }
    };
  }

  /**
   * Build prompt based on context type
   */
  static async buildPrompt(
    contextResult: {
      context: StructuredCampaignContext | GeminiContext;
      hasDualChunking: boolean;
      pathUsed: 'enhanced' | 'standard';
      campaignFocus?: string;
    },
    campaignRequest: any,
    clientProfile: StructuredClientProfile
  ): Promise<string> {
    
    console.log(`[UNIFIED_CONTEXT] Building prompt using ${contextResult.pathUsed} path`);
    
    if (contextResult.pathUsed === 'enhanced' && contextResult.hasDualChunking) {
      // Use enhanced prompt with atomic ingredients and narratives
      const geminiContext = contextResult.context as GeminiContext;
      
      // Import and use the EnhancedContextBuilder prompt logic
      const { EnhancedContextBuilder } = await import('./CampaignContextBuilder');
      
      const enhancedPrompt = EnhancedContextBuilder.buildEnhancedPrompt(
        geminiContext,
        {
          adType: 'Google Ads campaign',
          campaignType: campaignRequest.campaignType,
          adGroupType: campaignRequest.adGroupType,
          location: campaignRequest.location,
          requirements: {
            headlines: 15,
            descriptions: 4,
            character_limits: {
              headlines: { min: 20, max: 30 },
              descriptions: { min: 65, max: 90 }
            }
          }
        }
      );
      
      console.log(`[UNIFIED_CONTEXT] Enhanced prompt built (${enhancedPrompt.length} chars)`);
      return enhancedPrompt;
      
    } else {
      // Use standard prompt with structured context
      const structuredContext = contextResult.context as StructuredCampaignContext;
      
      // Import and use the EnhancedPromptGenerator
      const { EnhancedPromptGenerator } = await import('./EnhancedPromptGenerator');
      
      const standardPrompt = await EnhancedPromptGenerator.generateDualChunkingPrompt(
        campaignRequest,
        structuredContext,
        clientProfile
      );
      
      console.log(`[UNIFIED_CONTEXT] Standard prompt built (${standardPrompt.length} chars)`);
      return standardPrompt;
    }
  }

  /**
   * Utility method to get context summary for logging
   */
  static getContextSummary(
    contextResult: {
      context: StructuredCampaignContext | GeminiContext;
      hasDualChunking: boolean;
      pathUsed: 'enhanced' | 'standard';
      campaignFocus?: string;
    }
  ): string {
    
    if (contextResult.pathUsed === 'enhanced') {
      const geminiContext = contextResult.context as GeminiContext;
      const atomicCount = Object.values(geminiContext.atomicIngredients).flat().length;
      const narrativeCount = geminiContext.narrativeContext.length;
      
      return `Enhanced context: ${atomicCount} atomic ingredients, ${narrativeCount} narrative chunks, focus: ${contextResult.campaignFocus}`;
      
    } else {
      const structuredContext = contextResult.context as StructuredCampaignContext;
      
      return `Standard context: ${structuredContext.overallRelevanceScore}% relevance, ${structuredContext.contextStrength} strength, 6 sections`;
    }
  }
}

// Export for backward compatibility
export type { 
  StructuredCampaignContext, 
  CampaignContextSection,
  GeminiContext 
} from './CampaignContextBuilder';