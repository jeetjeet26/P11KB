import { StructuredClientProfile } from './ClientProfileManager';
import { createClient } from '@/lib/supabase/server';

// Add interface for Gemini Context (Phase 2)
export interface GeminiContext {
  atomicIngredients: {
    amenities: string[];
    features: string[];
    location: string[];
    pricing: string[];
    lifestyle: string[];
    community: string[];
    cta: string[];
    urgency: string[];
  };
  narrativeContext: string[];
  campaignFocus: string;
  adType?: string;
}

// Interface for atomic chunk data
interface AtomicChunk {
  content: string;
  chunk_subtype: string;
  atomic_category?: string;
  [key: string]: any;
}

// Campaign focus mapping for dual chunking
const CAMPAIGN_FOCUS_MAPPING: Record<string, { atomic_categories: string[], narrative_types: string[] }> = {
  'luxury_amenities': {
    atomic_categories: ['amenity', 'lifestyle', 'feature', 'location', 'pricing', 'special', 'community'], // Include all categories for flexibility
    narrative_types: ['narrative_amenity', 'narrative_amenities', 'narrative_lifestyle', 'narrative_community', 'narrative_feature', 'narrative_location']
  },
  'location_benefits': {
    atomic_categories: ['location', 'amenity'], // Include location and amenity for location-focused campaigns
    narrative_types: ['narrative_location', 'narrative_amenities', 'narrative_amenity', 'narrative_lifestyle']
  },
  'value_pricing': {
    atomic_categories: ['pricing', 'feature', 'special', 'location'],
    narrative_types: ['narrative_community', 'narrative_pricing', 'narrative_feature']
  },
  'general_focus': {
    atomic_categories: ['amenity', 'lifestyle', 'feature', 'location', 'pricing', 'special', 'community'], // Include all categories
    narrative_types: ['narrative_amenity', 'narrative_amenities', 'narrative_location', 'narrative_lifestyle', 'narrative_community', 'narrative_feature', 'narrative_pricing']
  }
};

// ===== PHASE 2: ENHANCED CONTEXT BUILDER =====

/**
 * Enhanced Context Builder for Gemini with dual chunking support
 */
export class EnhancedContextBuilder {
  
  /**
   * Build organized Gemini context using dual chunking system
   */
  static async buildGeminiContext(
    communityName: string, 
    campaignFocus: string,
    clientId: string
  ): Promise<GeminiContext> {
    
    console.log(`[ENHANCED_CONTEXT] Building Gemini context for ${communityName}, focus: ${campaignFocus}`);
    
    const supabase = createClient();
    
    // 1. Retrieve relevant atomic chunks as ingredients
    const atomicIngredients = await this.retrieveAtomicIngredients(
      supabase, clientId, communityName, campaignFocus
    );
    
    // 2. Retrieve supporting narrative context
    const narrativeContext = await this.retrieveNarrativeContext(
      supabase, clientId, communityName, campaignFocus
    );
    
    // 3. Organize context for Gemini and enrich with fallbacks from narratives
    const organized = this.organizeAtomicIngredients(atomicIngredients);
    const enriched = this.enrichAtomicIngredientsFromNarratives(organized, narrativeContext);
    
    return {
      atomicIngredients: enriched,
      narrativeContext: narrativeContext,
      campaignFocus: campaignFocus
    };
  }
  
  /**
   * Retrieve atomic chunks organized by category for campaign focus
   */
  private static async retrieveAtomicIngredients(
    supabase: any,
    clientId: string,
    communityName: string,
    campaignFocus: string
  ) {
    console.log(`[ENHANCED_CONTEXT] ========== ATOMIC CHUNK RETRIEVAL DEBUG ==========`);
    console.log(`[ENHANCED_CONTEXT] Retrieving atomic ingredients for focus: ${campaignFocus}`);
    console.log(`[ENHANCED_CONTEXT] Client ID: ${clientId}`);
    console.log(`[ENHANCED_CONTEXT] Community Name: ${communityName}`);
    
    // Get campaign focus mapping or use general focus  
    const focusConfig = CAMPAIGN_FOCUS_MAPPING[campaignFocus as keyof typeof CAMPAIGN_FOCUS_MAPPING] 
      || CAMPAIGN_FOCUS_MAPPING.general_focus;
    
    console.log(`[ENHANCED_CONTEXT] Focus Config:`, JSON.stringify(focusConfig, null, 2));
    
    // Build query for atomic chunks using unified schema
    // All sources now use chunk_subtype consistently
    console.log(`[ENHANCED_CONTEXT] Building query with filters:`);
    console.log(`[ENHANCED_CONTEXT] - client_id = '${clientId}'`);
    console.log(`[ENHANCED_CONTEXT] - chunk_type = 'llm_dual'`);
    console.log(`[ENHANCED_CONTEXT] - chunk_subtype LIKE 'atomic_%'`);
    
    let query = supabase
      .from('chunks')
      .select('*')
      .eq('client_id', clientId)
      .eq('chunk_type', 'llm_dual')
      .like('chunk_subtype', 'atomic_%');
    
    // Add community name filter if available - use flexible matching for web content
    // Web chunks may have different community names extracted from the website
    if (communityName && communityName !== 'Auto-Extract') {
      // Don't filter by community_name for web chunks - they belong to the client_id
      // Only filter document chunks which should have exact community_name matches
      // Since we can't do conditional filters in a single query, we'll filter after retrieval
    }
    
    // Order by recency, prioritizing web content (recent crawls are more current)
    query = query.order('crawl_timestamp', { ascending: false, nullsLast: true })
                 .order('created_at', { ascending: false });
    
    console.log(`[ENHANCED_CONTEXT] Executing query with limit 100...`);
    const { data: allAtomicChunks, error } = await query.limit(100);
    
    console.log(`[ENHANCED_CONTEXT] Query executed. Error:`, error ? JSON.stringify(error, null, 2) : 'none');
    console.log(`[ENHANCED_CONTEXT] Raw result count: ${allAtomicChunks?.length || 0}`);
    
    if (error) {
      console.error('[ENHANCED_CONTEXT] ❌ Error retrieving atomic chunks:', error);
      console.error('[ENHANCED_CONTEXT] Error details:', JSON.stringify(error, null, 2));
      return [];
    }
    
    if (!allAtomicChunks || allAtomicChunks.length === 0) {
      console.warn('[ENHANCED_CONTEXT] ⚠️ NO ATOMIC CHUNKS FOUND!');
      console.warn('[ENHANCED_CONTEXT] This means NO chunks matched the query filters:');
      console.warn('[ENHANCED_CONTEXT] - client_id = ' + clientId);
      console.warn('[ENHANCED_CONTEXT] - chunk_type = llm_dual');
      console.warn('[ENHANCED_CONTEXT] - chunk_subtype LIKE atomic_%');
      console.warn('[ENHANCED_CONTEXT] Please verify chunks exist in database with these criteria.');
    } else {
      console.log(`[ENHANCED_CONTEXT] ✅ Found ${allAtomicChunks.length} atomic chunks`);
      console.log(`[ENHANCED_CONTEXT] Sample chunk:`, {
        id: allAtomicChunks[0]?.id,
        chunk_type: allAtomicChunks[0]?.chunk_type,
        chunk_subtype: allAtomicChunks[0]?.chunk_subtype,
        source_type: allAtomicChunks[0]?.source_type,
        atomic_category: allAtomicChunks[0]?.atomic_category,
        content_preview: allAtomicChunks[0]?.content?.substring(0, 100)
      });
    }
    
    // Log what we retrieved before filtering
    console.log(`[ENHANCED_CONTEXT] Retrieved ${allAtomicChunks?.length || 0} total atomic chunks before category filtering`);
    
    // Apply atomic category filter post-retrieval to be more flexible
    // This allows us to include web chunks that might not have exact category matches
    let atomicChunks = allAtomicChunks || [];
    
    if (focusConfig.atomic_categories.length > 0) {
      // Separate web and doc chunks using new source_type field
      const webChunks: any[] = atomicChunks.filter((chunk: any) => chunk.source_type === 'web');
      const docChunks: any[] = atomicChunks.filter((chunk: any) => chunk.source_type === 'document');
      
      // For doc chunks, apply strict category filter
      const allowedCategories = focusConfig.atomic_categories as string[];
      const filteredDocChunks: any[] = docChunks.filter((chunk: any) => {
        // Try metadata JSONB first, fall back to legacy column
        const category = chunk.metadata?.atomic_category || chunk.atomic_category;
        return category && allowedCategories.includes(category);
      });
      
      // For web chunks, be more lenient - include all if they have any category, or if no category is set
      const filteredWebChunks: any[] = webChunks.filter((chunk: any) => {
        const category = chunk.metadata?.atomic_category || chunk.atomic_category;
        return !category || allowedCategories.includes(category);
      });
      
      atomicChunks = [...filteredWebChunks, ...filteredDocChunks];
      console.log(`[ENHANCED_CONTEXT] After category filtering: ${atomicChunks.length} chunks (${filteredWebChunks.length} web, ${filteredDocChunks.length} doc)`);
    }
    
    // Log breakdown by source type
    const webChunks = atomicChunks.filter((chunk: any) => chunk.source_type === 'web');
    const docChunks = atomicChunks.filter((chunk: any) => chunk.source_type === 'document');
    
    console.log(`[ENHANCED_CONTEXT] Final atomic chunks: ${atomicChunks.length}`);
    console.log(`[ENHANCED_CONTEXT] - Web content: ${webChunks.length} chunks`);
    console.log(`[ENHANCED_CONTEXT] - Document content: ${docChunks.length} chunks`);
    
    if (webChunks.length > 0) {
      const pageTypes = Array.from(new Set(webChunks.map((chunk: any) => chunk.page_type).filter(Boolean)));
      const categories = Array.from(new Set(webChunks.map((chunk: any) => chunk.metadata?.atomic_category || chunk.atomic_category).filter(Boolean)));
      console.log(`[ENHANCED_CONTEXT] - Web page types: ${pageTypes.join(', ')}`);
      console.log(`[ENHANCED_CONTEXT] - Web atomic categories: ${categories.join(', ')}`);
    }
    
    // Prioritize: web chunks first, then semantic importance, then recency
    atomicChunks.sort((a: any, b: any) => {
      const aIsWeb = !!a.source_url; const bIsWeb = !!b.source_url;
      if (aIsWeb !== bIsWeb) return aIsWeb ? -1 : 1; // web first
      const importanceRank = (v: string | null | undefined) => v === 'high' ? 0 : v === 'medium' ? 1 : 2;
      const aImp = importanceRank(a.semantic_importance);
      const bImp = importanceRank(b.semantic_importance);
      if (aImp !== bImp) return aImp - bImp;
      const aTime = a.crawl_timestamp || a.created_at || 0;
      const bTime = b.crawl_timestamp || b.created_at || 0;
      return (bTime > aTime) ? 1 : (bTime < aTime) ? -1 : 0;
    });

    return atomicChunks;
  }
  
  /**
   * Retrieve narrative chunks that support the campaign focus
   */
  private static async retrieveNarrativeContext(
    supabase: any,
    clientId: string,
    communityName: string,
    campaignFocus: string
  ): Promise<string[]> {
    console.log(`[ENHANCED_CONTEXT] ========== NARRATIVE CHUNK RETRIEVAL DEBUG ==========`);
    console.log(`[ENHANCED_CONTEXT] Retrieving narrative context for focus: ${campaignFocus}`);
    console.log(`[ENHANCED_CONTEXT] Client ID: ${clientId}`);
    
    // Get campaign focus mapping or use general focus
    const focusConfig = CAMPAIGN_FOCUS_MAPPING[campaignFocus as keyof typeof CAMPAIGN_FOCUS_MAPPING] 
      || CAMPAIGN_FOCUS_MAPPING.general_focus;
    
    // Build query for narrative chunks using unified schema
    // All sources now use chunk_subtype consistently
    let query = supabase
      .from('chunks')
      .select('*')
      .eq('client_id', clientId)
      .eq('chunk_type', 'llm_dual')
      .like('chunk_subtype', 'narrative_%');
    
    // Add community name filter if available - use flexible matching for web content
    // Web chunks may have different community names extracted from the website
    if (communityName && communityName !== 'Auto-Extract') {
      // Don't filter by community_name for web chunks - they belong to the client_id
      // Only filter document chunks which should have exact community_name matches
      // Since we can't do conditional filters in a single query, we'll filter after retrieval
    }
    
    // Narrative type filtering is done post-retrieval for flexibility
    // All chunks now use chunk_subtype consistently in the unified schema
    
    // Prioritize homepage and key pages from web content
    query = query.order('page_type', { ascending: true, nullsLast: true }) // homepage comes first
                 .order('crawl_timestamp', { ascending: false, nullsLast: true })
                 .order('created_at', { ascending: false });
    
    console.log(`[ENHANCED_CONTEXT] Executing narrative query with limit 50...`);
    const { data: narrativeChunks, error } = await query.limit(50); // Increased limit to get more web chunks
    
    console.log(`[ENHANCED_CONTEXT] Narrative query executed. Error:`, error ? JSON.stringify(error, null, 2) : 'none');
    console.log(`[ENHANCED_CONTEXT] Raw narrative result count: ${narrativeChunks?.length || 0}`);
    
    if (error) {
      console.error('[ENHANCED_CONTEXT] ❌ Error retrieving narrative chunks:', error);
      console.error('[ENHANCED_CONTEXT] Error details:', JSON.stringify(error, null, 2));
      return [];
    }
    
    if (!narrativeChunks || narrativeChunks.length === 0) {
      console.warn('[ENHANCED_CONTEXT] ⚠️ NO NARRATIVE CHUNKS FOUND!');
      console.warn('[ENHANCED_CONTEXT] This means NO chunks matched the query filters:');
      console.warn('[ENHANCED_CONTEXT] - client_id = ' + clientId);
      console.warn('[ENHANCED_CONTEXT] - chunk_type = llm_dual');
      console.warn('[ENHANCED_CONTEXT] - chunk_subtype LIKE narrative_%');
      console.warn('[ENHANCED_CONTEXT] Please verify chunks exist in database with these criteria.');
    } else {
      console.log(`[ENHANCED_CONTEXT] ✅ Found ${narrativeChunks.length} narrative chunks`);
      console.log(`[ENHANCED_CONTEXT] Sample chunk:`, {
        id: narrativeChunks[0]?.id,
        chunk_type: narrativeChunks[0]?.chunk_type,
        chunk_subtype: narrativeChunks[0]?.chunk_subtype,
        source_type: narrativeChunks[0]?.source_type,
        page_type: narrativeChunks[0]?.page_type,
        content_preview: narrativeChunks[0]?.content?.substring(0, 100)
      });
    }
    
    // Log breakdown by source type and page types
    const webChunks: any[] = narrativeChunks?.filter((chunk: any) => chunk.source_url) || [];
    const docChunks: any[] = narrativeChunks?.filter((chunk: any) => !chunk.source_url) || [];
    
    console.log(`[ENHANCED_CONTEXT] Retrieved ${narrativeChunks?.length || 0} narrative chunks`);
    console.log(`[ENHANCED_CONTEXT] - Web content: ${webChunks.length} chunks`);
    console.log(`[ENHANCED_CONTEXT] - Document content: ${docChunks.length} chunks`);
    
    if (webChunks.length > 0) {
      const pageTypes: string[] = Array.from(new Set(webChunks.map((chunk: any) => chunk.page_type).filter(Boolean)));
      console.log(`[ENHANCED_CONTEXT] - Web page types: ${pageTypes.join(', ')}`);
    }
    
    return narrativeChunks?.map((chunk: any) => chunk.content) || [];
  }
  
  /**
   * Organize atomic ingredients by category for Gemini
   */
  private static organizeAtomicIngredients(atomicChunks: AtomicChunk[]) {
    const organized: {
      amenities: string[];
      features: string[];
      location: string[];
      pricing: string[];
      lifestyle: string[];
      community: string[];
      cta: string[];
      urgency: string[];
    } = {
      amenities: [],
      features: [],
      location: [],
      pricing: [],
      lifestyle: [],
      community: [],
      cta: [],
      urgency: []
    };
    
    for (const chunk of atomicChunks) {
      const content = chunk.content;
      const subtype = chunk.chunk_subtype;
      // Try metadata JSONB first, fall back to legacy column
      const category = chunk.metadata?.atomic_category || chunk.atomic_category;
      const text = (content || '').toLowerCase();

      // Organize by explicit chunk subtype first (document-derived atomic_* subtypes)
      switch (subtype) {
        case 'atomic_amenity':
          organized.amenities.push(content);
          continue;
        case 'atomic_feature':
          organized.features.push(content);
          continue;
        case 'atomic_location':
          organized.location.push(content);
          continue;
        case 'atomic_price':
        case 'atomic_special':
          organized.pricing.push(content);
          continue;
        case 'atomic_lifestyle':
          organized.lifestyle.push(content);
          continue;
        case 'atomic_community':
          organized.community.push(content);
          continue;
        case 'atomic_cta':
          organized.cta.push(content);
          continue;
        case 'atomic_urgency':
          organized.urgency.push(content);
          continue;
        default:
          // fall through to metadata/heuristics
          break;
      }

      // Fallback 1: Use atomic_category metadata (common for web chunks)
      if (category === 'amenity') { organized.amenities.push(content); continue; }
      if (category === 'feature') { organized.features.push(content); continue; }
      if (category === 'location') { organized.location.push(content); continue; }
      if (category === 'pricing' || category === 'price') { organized.pricing.push(content); continue; }
      if (category === 'lifestyle') { organized.lifestyle.push(content); continue; }
      if (category === 'community') { organized.community.push(content); continue; }
      if (category === 'cta') { organized.cta.push(content); continue; }
      if (category === 'urgency') { organized.urgency.push(content); continue; }

      // Fallback 2: Heuristic inference from content text (to reduce "None provided" cases)
      if (/(pool|spa|cabanas|rooftop|grill|dog park|pet wash|clubhouse|lounge|courtyard|fire pit)/i.test(text)) {
        organized.amenities.push(content); continue;
      }
      if (/(in[- ]unit laundry|washer|dryer|dishwasher|stainless|hardwood|balcony|patio|island kitchen|granite|quartz|walk[- ]in closet|smart home|keyless|ev charging)/i.test(text)) {
        organized.features.push(content); continue;
      }
      if (/(downtown|city center|walk to|steps from|nearby|minutes to|commute|transit|subway|station|bus|light rail|highway|freeway|neighborhood|district)/i.test(text)) {
        organized.location.push(content); continue;
      }
      if (/(starting at|from \$|\$\d|special|incentive|one month free|move[- ]in special|reduced|limited time)/i.test(text)) {
        organized.pricing.push(content); continue;
      }
      if (/(modern living|urban living|vibrant lifestyle|resort[- ]style|work[- ]from[- ]home|roommate[- ]friendly|wellness|pet[- ]friendly)/i.test(text)) {
        organized.lifestyle.push(content); continue;
      }
      if (/(apply now|schedule (a )?tour|tour today|call (now|today)|check availability|lease today|join (the )?(vip|priority) list)/i.test(text)) {
        organized.cta.push(content); continue;
      }
      if (/(limited time|available now|move[- ]in ready|now leasing|don’t miss|last (few|units))/i.test(text)) {
        organized.urgency.push(content); continue;
      }

      // Fallback 3: Default to features if nothing else matched
      organized.features.push(content);
    }

    // De-duplicate within each category and preserve original order
    const dedupe = (arr: string[]) => Array.from(new Set(arr));
    organized.amenities = dedupe(organized.amenities);
    organized.features = dedupe(organized.features);
    organized.location = dedupe(organized.location);
    organized.pricing = dedupe(organized.pricing);
    organized.lifestyle = dedupe(organized.lifestyle);
    organized.community = dedupe(organized.community);
    organized.cta = dedupe(organized.cta);
    organized.urgency = dedupe(organized.urgency);
    
    console.log(`[ENHANCED_CONTEXT] Organized atomic ingredients:`, {
      amenities: organized.amenities.length,
      features: organized.features.length,
      location: organized.location.length,
      pricing: organized.pricing.length,
      lifestyle: organized.lifestyle.length,
      community: organized.community.length,
      cta: organized.cta.length,
      urgency: organized.urgency.length
    });
    
    return organized;
  }

  /**
   * Enrich atomic ingredients by mining narrative context when categories are empty.
   * This reduces generic outputs when web/doc atomic chunks are sparse.
   */
  private static enrichAtomicIngredientsFromNarratives(
    atomic: {
      amenities: string[];
      features: string[];
      location: string[];
      pricing: string[];
      lifestyle: string[];
      community: string[];
      cta: string[];
      urgency: string[];
    },
    narratives: string[]
  ) {
    if (!narratives || narratives.length === 0) return atomic;

    const text = narratives.join('\n').toLowerCase();

    const pushIf = (arr: string[], phrase: string) => {
      if (phrase && !arr.includes(phrase)) arr.push(phrase);
    };

    // Only enrich categories that are empty to avoid diluting strong signals
    if (atomic.amenities.length === 0) {
      const amenityMatches = text.match(/(rooftop pool|pool|spa|cabanas|fitness center|gym|yoga studio|co-?working lounge|dog park|pet wash|clubhouse|lounge|courtyard|fire pit)/gi) || [];
      amenityMatches.slice(0, 6).forEach(m => pushIf(atomic.amenities, m.trim()));
    }

    if (atomic.features.length === 0) {
      const featureMatches = text.match(/(in[- ]unit laundry|washer(?:\/?dryer)?|dishwasher|stainless (?:steel )?appliances|hardwood floors|balcony|patio|quartz countertops|granite countertops|walk[- ]in closet|smart home|keyless entry|ev charging)/gi) || [];
      featureMatches.slice(0, 8).forEach(m => pushIf(atomic.features, m.trim()));
    }

    if (atomic.location.length === 0) {
      const locMatches = text.match(/(downtown|city center|walk to [^.,\n]+|steps from [^.,\n]+|near(?:by)? [^.,\n]+|minutes to [^.,\n]+|near transit|transit access|commute|light rail|subway|bus|highway|freeway|\bneighborhood\b|district)/gi) || [];
      locMatches.slice(0, 8).forEach(m => pushIf(atomic.location, m.trim()));
    }

    if (atomic.pricing.length === 0) {
      const priceMatches = text.match(/(starting at \$\d[\d,]*|from \$\d[\d,]*|\$\d[\d,]*\+?|move[- ]in special|one month free|limited time (?:offer|special))/gi) || [];
      priceMatches.slice(0, 4).forEach(m => pushIf(atomic.pricing, m.trim()));
    }

    if (atomic.lifestyle.length === 0) {
      const lifeMatches = text.match(/(modern living|urban living|vibrant lifestyle|work[- ]from[- ]home|roommate[- ]friendly|wellness-?focused|pet-?friendly)/gi) || [];
      lifeMatches.slice(0, 6).forEach(m => pushIf(atomic.lifestyle, m.trim()));
    }

    if (atomic.community.length === 0) {
      const commMatches = text.match(/("[^"]+"|\b[A-Z][A-Za-z]+(?:\s[A-Z][A-Za-z]+){0,2}\b) (apartments|residences|community)/g) || [];
      commMatches.slice(0, 3).forEach(m => pushIf(atomic.community, m.trim()));
    }

    if (atomic.cta.length === 0) {
      const ctaMatches = text.match(/(schedule (?:a )?tour|tour today|apply now|call (?:now|today)|check availability|lease today|join (?:the )?(?:vip|priority) list)/gi) || [];
      ctaMatches.slice(0, 4).forEach(m => pushIf(atomic.cta, m.trim()));
    }

    if (atomic.urgency.length === 0) {
      const urgMatches = text.match(/(limited time|available now|now leasing|move[- ]in ready|last (?:few|units))/gi) || [];
      urgMatches.slice(0, 3).forEach(m => pushIf(atomic.urgency, m.trim()));
    }

    return atomic;
  }
  
  /**
   * Build enhanced prompt structure with atomic ingredients + narrative context
   */
  static buildEnhancedPrompt(context: GeminiContext, requirements: any): string {
    // Build the JSON format example dynamically
    const headlineCount = requirements?.headlines || 15;
    const descriptionCount = requirements?.descriptions || 4;
    const headlineMinChars = requirements?.character_limits?.headlines?.min || 20;
    const headlineMaxChars = requirements?.character_limits?.headlines?.max || 30;
    const descriptionMinChars = requirements?.character_limits?.descriptions?.min || 65;
    const descriptionMaxChars = requirements?.character_limits?.descriptions?.max || 90;
    
    const headlineExamples = Array.from({length: headlineCount}, (_, i) => 
      `    "Headline ${i + 1} (${headlineMinChars}-${headlineMaxChars} characters)"`
    ).join(',\n');
    
    const descriptionExamples = Array.from({length: descriptionCount}, (_, i) => 
      `    "Description ${i + 1} (${descriptionMinChars}-${descriptionMaxChars} characters)"`
    ).join(',\n');
    
    const campaignType = requirements?.campaignType as string | undefined;
    const adGroupType = requirements?.adGroupType as string | undefined;

    // Campaign-specific keyword volume targets
    const volumeTargets = (() => {
      if (campaignType === 're_general_location') {
        return { broadMin: 50, broadMax: 100, negMin: 15, unitNegNote: '' };
      }
      if (campaignType === 're_unit_type') {
        return { broadMin: 50, broadMax: 75, negMin: 20, unitNegNote: ' Include other unit types as negatives (e.g., studio, 1 bedroom, 3 bedroom).' };
      }
      // proximity/default
      return { broadMin: 50, broadMax: 90, negMin: 15, unitNegNote: '' };
    })();

    const prompt = `
Generate ${context.adType || 'ad copy'} for luxury multifamily apartment marketing.

ATOMIC COMPONENTS TO REFERENCE:
Amenities: ${context.atomicIngredients.amenities.join(', ') || 'None provided'}
Features: ${context.atomicIngredients.features.join(', ') || 'None provided'}
Location: ${context.atomicIngredients.location.join(', ') || 'None provided'}
Pricing: ${context.atomicIngredients.pricing.join(', ') || 'None provided'}
Lifestyle: ${context.atomicIngredients.lifestyle.join(', ') || 'None provided'}
Community: ${context.atomicIngredients.community.join(', ') || 'None provided'}
Call-to-Action Options: ${context.atomicIngredients.cta.join(', ') || 'Tour today, Apply now, Call now'}
Urgency Elements: ${context.atomicIngredients.urgency.join(', ') || 'None provided'}

NARRATIVE CONTEXT:
${context.narrativeContext.length > 0 ? context.narrativeContext.join('\n\n') : 'Use atomic components to create compelling narrative'}

Campaign Focus: ${context.campaignFocus}
Requirements: Generate creative, compelling copy that incorporates relevant atomic components while maintaining brand voice.

INSTRUCTIONS (MANDATORY USAGE RULES):
1. Use atomic components as precise ingredients for your copy. You MUST pull exact phrases from every non-empty category below:
   - Amenities, Features, Location, Pricing, Lifestyle, Community, CTA, Urgency
2. Web-sourced phrases take precedence over document phrases. Prefer wording that appears in the website content when available.
3. Combine atomic ingredients creatively to build compelling headlines and descriptions. Whenever combining, keep at least one exact phrase intact.
4. Maintain focus on ${context.campaignFocus} throughout all copy.
5. Ensure all copy meets character requirements and brand voice guidelines.
6. Avoid generic language. If a category has items, do not write a generic substitute—use the provided items.
7. Distribute usage across the 15 headlines so that all non-empty categories are represented multiple times. Avoid repeating the same phrase more than once unless necessary for character fixes.

OUTPUT FORMAT:
You MUST return your response as valid JSON in this exact format:
{
  "headlines": [
${headlineExamples}
  ],
  "descriptions": [
${descriptionExamples}
  ],
  "keywords": {
    "broad_match": ["broad keyword 1", "broad keyword 2", "broad keyword 3", "...continue to 40-60 total"],
    "negative_keywords": ["negative keyword 1", "negative keyword 2", "...continue to 15-20 total"]
  },
  "final_url_paths": ["/path1", "/path2", "/path3", "/path4"]
}

CRITICAL REQUIREMENTS:
- Generate exactly ${headlineCount} headlines between ${headlineMinChars}-${headlineMaxChars} characters each
- Generate exactly ${descriptionCount} descriptions between ${descriptionMinChars}-${descriptionMaxChars} characters each
- Keyword Volume: Broad Match ${volumeTargets.broadMin}-${volumeTargets.broadMax} keywords; Negative Keywords ${volumeTargets.negMin}+ keywords.${volumeTargets.unitNegNote}
- Include 4 final URL paths
- Return ONLY valid JSON, no additional text or formatting.
- In the JSON, ensure that headlines/descriptions visibly incorporate phrases from the atomic lists (prioritize web-derived phrasing). If a list is empty, skip that category.

 CTA & COMPOSITION REQUIREMENTS:
 - Headlines: 3–5 should include a CTA (approved: Call Today, Schedule A Tour, Learn More, Join The VIP List, Join The Priority List, Apply Now, Lease Today, Check Availability)
 - Descriptions: At least 1 should include a CTA
 - Abbreviation Balance: Use a mix — at least 3 headlines and 1 description must use fully spelled words "Apartments" and/or "Bedrooms"; others may use "Apts"/"BR" where helpful

 FAIR HOUSING SAFETY (DO NOT VIOLATE):
 - Avoid audience-inference phrases or protected-class references (e.g., "family-friendly", "for families", age, religion, disability). Prefer neutral alternatives like "spacious layouts", "roommate-friendly", "work-from-home ready", "flexible space".
    `;
    
    return prompt;
  }
  
  /**
   * Determine campaign focus based on campaign type and ad group
   */
  static determineCampaignFocus(campaignType: string, adGroupType?: string): string {
    // Map campaign types to focus areas
    if (campaignType === 're_proximity') {
      return 'location_benefits';  // Focus on Google Maps data and nearby locations
    } else if (campaignType === 're_unit_type') {
      if (adGroupType === 'studio' || adGroupType === '1br') {
        return 'value_pricing';
      } else {
        return 'luxury_amenities';
      }
    } else if (campaignType === 're_general_location') {
      return 'luxury_amenities';  // Focus on community name, amenities, and lifestyle features
    }
    
    return 'general_focus';
  }
}

export interface CampaignRequest {
  clientId: string;
  campaignType: string;
  adGroupType?: string; // Optional for campaigns with distributed focuses
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

export interface CampaignContextSection {
  title: string;
  content: string;
  relevanceScore: number;
  priority: 'high' | 'medium' | 'low';
  dataSource: 'intake' | 'vector' | 'derived';
}

export interface StructuredCampaignContext {
  campaignType: string;
  adGroupType: string; // Will use 'distributed_focus' for campaigns without specific ad group
  contextSections: {
    brandVoice: CampaignContextSection;
    targetAudience: CampaignContextSection;
    propertyHighlights: CampaignContextSection;
    locationBenefits: CampaignContextSection;
    competitiveAdvantages: CampaignContextSection;
    pricingStrategy: CampaignContextSection;
  };
  overallRelevanceScore: number;
  contextStrength: 'strong' | 'moderate' | 'weak';
  campaignSpecificInstructions: string[];
  adGroupSpecificGuidance: string[];
  keywordStrategy: string[];
  generatedAt: Date;
}

export class CampaignContextBuilder {
  private static readonly CAMPAIGN_TYPE_WEIGHTS = {
    're_general_location': {
      brandVoice: 0.15,
      targetAudience: 0.20,
      propertyHighlights: 0.15,
      locationBenefits: 0.30,
      competitiveAdvantages: 0.10,
      pricingStrategy: 0.10
    },
    're_unit_type': {
      brandVoice: 0.15,
      targetAudience: 0.25,
      propertyHighlights: 0.35,
      locationBenefits: 0.10,
      competitiveAdvantages: 0.10,
      pricingStrategy: 0.05
    },
    're_proximity': {
      brandVoice: 0.10,
      targetAudience: 0.20,
      propertyHighlights: 0.15,
      locationBenefits: 0.40,
      competitiveAdvantages: 0.10,
      pricingStrategy: 0.05
    }
  };

  /**
   * Build campaign-specific context aligned with campaign type and ad group requirements
   */
  static buildCampaignContext(
    request: CampaignRequest,
    clientProfile: StructuredClientProfile
  ): StructuredCampaignContext {
    
    const campaignContext: StructuredCampaignContext = {
      campaignType: request.campaignType,
      adGroupType: request.adGroupType || 'distributed_focus',
      contextSections: {
        brandVoice: this.buildBrandVoiceSection(request, clientProfile),
        targetAudience: this.buildTargetAudienceSection(request, clientProfile),
        propertyHighlights: this.buildPropertyHighlightsSection(request, clientProfile),
        locationBenefits: this.buildLocationBenefitsSection(request, clientProfile),
        competitiveAdvantages: this.buildCompetitiveAdvantagesSection(request, clientProfile),
        pricingStrategy: this.buildPricingStrategySection(request, clientProfile)
      },
      overallRelevanceScore: 0,
      contextStrength: 'weak',
      campaignSpecificInstructions: this.generateCampaignInstructions(request, clientProfile),
      adGroupSpecificGuidance: this.generateAdGroupGuidance(request, clientProfile),
      keywordStrategy: [],
      generatedAt: new Date()
    };

    // Calculate overall relevance score and context strength
    campaignContext.overallRelevanceScore = this.calculateOverallRelevanceScore(
      campaignContext.contextSections, 
      request.campaignType
    );
    campaignContext.contextStrength = this.determineContextStrength(campaignContext.overallRelevanceScore);

    return campaignContext;
  }

  /**
   * Build brand voice section tailored to campaign type
   */
  private static buildBrandVoiceSection(
    request: CampaignRequest,
    profile: StructuredClientProfile
  ): CampaignContextSection {
    
    const brandVoice = profile.brandVoice;
    let content = '';
    let relevanceScore = 0;
    let dataSource: 'intake' | 'vector' | 'derived' = 'derived';

    if (brandVoice.voiceGuidelines) {
      content += `Brand Voice Guidelines: ${brandVoice.voiceGuidelines}\n`;
      relevanceScore += 30;
      dataSource = 'intake';
    }

    if (brandVoice.tone.length > 0) {
      content += `Tone: ${brandVoice.tone.join(', ')}\n`;
      relevanceScore += 20;
    }

    if (brandVoice.personality.length > 0) {
      content += `Brand Personality: ${brandVoice.personality.join(', ')}\n`;
      relevanceScore += 15;
    }

    if (brandVoice.communicationStyle.length > 0) {
      content += `Communication Style: ${brandVoice.communicationStyle.join(', ')}\n`;
      relevanceScore += 15;
    }

    if (brandVoice.brandValues.length > 0) {
      content += `Brand Values: ${brandVoice.brandValues.join(', ')}\n`;
      relevanceScore += 10;
    }

    // Campaign-specific brand voice adjustments
    if (request.campaignType === 're_proximity') {
      content += `\nProximity Campaign Focus: Emphasize convenience and accessibility benefits in brand voice.`;
      relevanceScore += 5;
    } else if (request.campaignType === 're_unit_type') {
      content += `\nUnit-Type Campaign Focus: Highlight lifestyle alignment and space utilization in messaging.`;
      relevanceScore += 5;
    } else if (request.campaignType === 're_general_location') {
      content += `\nLocation Campaign Focus: Emphasize neighborhood character and community connection.`;
      relevanceScore += 5;
    }

    // Fallback content
    if (!content.trim()) {
      content = `Brand Voice: Professional, friendly, and customer-focused approach suitable for real estate marketing.`;
      relevanceScore = 10;
    }

    return {
      title: 'Brand Voice Guidelines',
      content: content.trim(),
      relevanceScore: Math.min(relevanceScore, 100),
      priority: relevanceScore >= 50 ? 'high' : relevanceScore >= 25 ? 'medium' : 'low',
      dataSource
    };
  }

  /**
   * Build target audience section with campaign-specific demographic insights
   */
  private static buildTargetAudienceSection(
    request: CampaignRequest,
    profile: StructuredClientProfile
  ): CampaignContextSection {
    
    const demographics = profile.demographics;
    let content = '';
    let relevanceScore = 0;
    let dataSource: 'intake' | 'vector' | 'derived' = 'derived';

    if (demographics.primaryAudience) {
      content += `Primary Target Audience: ${demographics.primaryAudience}\n`;
      relevanceScore += 25;
      dataSource = 'intake';
    }

    if (demographics.ageRange.length > 0) {
      content += `Age Range: ${demographics.ageRange.join(', ')}\n`;
      relevanceScore += 15;
    }

    if (demographics.incomeLevel.length > 0) {
      content += `Income Level: ${demographics.incomeLevel.join(', ')}\n`;
      relevanceScore += 15;
    }

    if (demographics.lifestyle.length > 0) {
      content += `Lifestyle: ${demographics.lifestyle.join(', ')}\n`;
      relevanceScore += 15;
    }

    if (demographics.motivations.length > 0) {
      content += `Key Motivations: ${demographics.motivations.join(', ')}\n`;
      relevanceScore += 15;
    }

    if (demographics.painPoints.length > 0) {
      content += `Pain Points to Address: ${demographics.painPoints.join(', ')}\n`;
      relevanceScore += 10;
    }

    // Unit-specific demographic insights
    if (request.unitDetails?.bedrooms !== undefined) {
      const bedrooms = request.unitDetails.bedrooms;
      if (bedrooms === 0) {
        content += `\nStudio Demographic Focus: Young professionals, students, singles prioritizing location over space.`;
        relevanceScore += 10;
      } else if (bedrooms === 1) {
        content += `\n1-Bedroom Demographic Focus: Young couples, single professionals, those wanting dedicated work space.`;
        relevanceScore += 10;
      } else if (bedrooms >= 2) {
        content += `\nMulti-Bedroom Demographic Focus: Families, roommates, professionals needing home office space.`;
        relevanceScore += 10;
      }
    }

    // Campaign-specific audience targeting
    if (request.targetDemographic) {
      content += `\nCampaign Target Override: ${request.targetDemographic}`;
      relevanceScore += 15;
    }

    // Fallback content
    if (!content.trim()) {
      content = `Target Audience: General apartment seekers and renters in ${request.location.city}, ${request.location.state}`;
      relevanceScore = 15;
    }

    return {
      title: 'Target Audience Profile',
      content: content.trim(),
      relevanceScore: Math.min(relevanceScore, 100),
      priority: relevanceScore >= 60 ? 'high' : relevanceScore >= 30 ? 'medium' : 'low',
      dataSource
    };
  }

  /**
   * Build property highlights section aligned with campaign focus
   */
  private static buildPropertyHighlightsSection(
    request: CampaignRequest,
    profile: StructuredClientProfile
  ): CampaignContextSection {
    
    const property = profile.property;
    let content = '';
    let relevanceScore = 0;
    let dataSource: 'intake' | 'vector' | 'derived' = 'derived';

    if (property.communityName) {
      content += `Community: ${property.communityName}\n`;
      relevanceScore += 15;
      dataSource = 'intake';
    }

    if (property.amenities.length > 0) {
      // Filter amenities based on campaign type
      const relevantAmenities = this.filterAmenitiesByCampaign(property.amenities, request);
      if (relevantAmenities.length > 0) {
        content += `Key Amenities: ${relevantAmenities.join(', ')}\n`;
        relevanceScore += 25;
      }
    }

    if (property.uniqueFeatures.length > 0) {
      content += `Unique Features: ${property.uniqueFeatures.join(', ')}\n`;
      relevanceScore += 20;
    }

    if (property.competitiveDifferentiators.length > 0) {
      content += `Competitive Differentiators: ${property.competitiveDifferentiators.join(', ')}\n`;
      relevanceScore += 15;
    }

    // Unit-specific highlights
    if (request.unitDetails) {
      const unit = request.unitDetails;
      let unitDescription = '';
      
      if (unit.bedrooms !== undefined && unit.bathrooms !== undefined) {
        unitDescription += `${unit.bedrooms}BR/${unit.bathrooms}BA`;
      }
      if (unit.sqft) {
        unitDescription += ` ${unit.sqft} sqft`;
      }
      if (unit.unitType) {
        unitDescription += ` ${unit.unitType}`;
      }
      
      if (unitDescription) {
        content += `\nUnit Focus: ${unitDescription}`;
        relevanceScore += 15;
      }
    }

    // Special offers
    if (request.specialOffers) {
      content += `\nSpecial Offers: ${request.specialOffers}`;
      relevanceScore += 10;
    }

    // Fallback content
    if (!content.trim()) {
      content = `Property highlights not specified in client data. Focus on general apartment features and location benefits.`;
      relevanceScore = 5;
    }

    return {
      title: 'Property Highlights',
      content: content.trim(),
      relevanceScore: Math.min(relevanceScore, 100),
      priority: relevanceScore >= 50 ? 'high' : relevanceScore >= 25 ? 'medium' : 'low',
      dataSource
    };
  }

  /**
   * Build location benefits section with proximity focus
   */
  private static buildLocationBenefitsSection(
    request: CampaignRequest,
    profile: StructuredClientProfile
  ): CampaignContextSection {
    
    const property = profile.property;
    let content = '';
    let relevanceScore = 0;
    let dataSource: 'intake' | 'vector' | 'derived' = 'derived';

    // Base location
    content += `Location: ${request.location.city}, ${request.location.state}\n`;
    relevanceScore += 10;

    if (property.locationAdvantages.length > 0) {
      content += `Location Benefits: ${property.locationAdvantages.join(', ')}\n`;
      relevanceScore += 30;
      dataSource = 'vector';
    }

    // Proximity-specific content
    if (request.proximityTargets && request.proximityTargets.length > 0) {
      content += `Proximity Highlights: Near ${request.proximityTargets.join(', ')}\n`;
      relevanceScore += 25;
    }

    // Campaign-specific location focus
    if (request.campaignType === 're_proximity') {
      content += `\nProximity Campaign Strategy: Emphasize convenience, commute time, and accessibility to key destinations.`;
      relevanceScore += 15;
    } else if (request.campaignType === 're_general_location') {
      content += `\nLocation Campaign Strategy: Highlight neighborhood character, lifestyle, and community features.`;
      relevanceScore += 15;
    }

    // Additional context
    if (request.additionalContext) {
      content += `\nAdditional Location Context: ${request.additionalContext}`;
      relevanceScore += 10;
    }

    return {
      title: 'Location Benefits',
      content: content.trim(),
      relevanceScore: Math.min(relevanceScore, 100),
      priority: relevanceScore >= 50 ? 'high' : relevanceScore >= 25 ? 'medium' : 'low',
      dataSource
    };
  }

  /**
   * Build competitive advantages section
   */
  private static buildCompetitiveAdvantagesSection(
    request: CampaignRequest,
    profile: StructuredClientProfile
  ): CampaignContextSection {
    
    const competitor = profile.competitor;
    let content = '';
    let relevanceScore = 0;
    let dataSource: 'intake' | 'vector' | 'derived' = 'derived';

    if (competitor.marketPosition) {
      content += `Market Position: ${competitor.marketPosition}\n`;
      relevanceScore += 15;
    }

    if (competitor.competitiveAdvantages.length > 0) {
      content += `Competitive Advantages: ${competitor.competitiveAdvantages.join(', ')}\n`;
      relevanceScore += 25;
      dataSource = 'vector';
    }

    if (competitor.differentiationPoints.length > 0) {
      content += `Key Differentiators: ${competitor.differentiationPoints.join(', ')}\n`;
      relevanceScore += 20;
    }

    if (competitor.pricingAdvantages.length > 0) {
      content += `Pricing Advantages: ${competitor.pricingAdvantages.join(', ')}\n`;
      relevanceScore += 15;
    }

    if (competitor.competitors.length > 0) {
      content += `Known Competitors: ${competitor.competitors.join(', ')}\n`;
      relevanceScore += 10;
      dataSource = 'intake';
    }

    // Fallback content
    if (!content.trim()) {
      content = `Competitive advantages not specified. Focus on unique property features and location benefits to differentiate.`;
      relevanceScore = 5;
    }

    return {
      title: 'Competitive Advantages',
      content: content.trim(),
      relevanceScore: Math.min(relevanceScore, 100),
      priority: relevanceScore >= 40 ? 'high' : relevanceScore >= 20 ? 'medium' : 'low',
      dataSource
    };
  }

  /**
   * Build pricing strategy section
   */
  private static buildPricingStrategySection(
    request: CampaignRequest,
    profile: StructuredClientProfile
  ): CampaignContextSection {
    
    let content = '';
    let relevanceScore = 0;
    let dataSource: 'intake' | 'vector' | 'derived' = 'derived';

    if (profile.property.pricePoint) {
      content += `Price Point: ${profile.property.pricePoint}\n`;
      relevanceScore += 20;
      dataSource = 'intake';
    }

    if (request.priceRange) {
      content += `Campaign Price Range: ${request.priceRange}\n`;
      relevanceScore += 25;
    }

    if (profile.property.specialOffers.length > 0) {
      content += `Special Offers: ${profile.property.specialOffers.join(', ')}\n`;
      relevanceScore += 20;
    }

    if (request.specialOffers) {
      content += `Campaign Special Offers: ${request.specialOffers}\n`;
      relevanceScore += 15;
    }

    if (profile.competitor.pricingAdvantages.length > 0) {
      content += `Pricing Advantages vs Competitors: ${profile.competitor.pricingAdvantages.join(', ')}\n`;
      relevanceScore += 10;
    }

    // Campaign-specific pricing messaging
    if (request.campaignType === 're_unit_type') {
      content += `\nUnit-Type Pricing Strategy: Emphasize value per square foot and unit-specific amenities.`;
      relevanceScore += 5;
    }

    // Fallback content
    if (!content.trim()) {
      content = `Pricing information not specified. Focus on value proposition and competitive market positioning.`;
      relevanceScore = 5;
    }

    return {
      title: 'Pricing Strategy',
      content: content.trim(),
      relevanceScore: Math.min(relevanceScore, 100),
      priority: relevanceScore >= 40 ? 'high' : relevanceScore >= 20 ? 'medium' : 'low',
      dataSource
    };
  }

  /**
   * Generate campaign-specific instructions for ad copy generation
   */
  private static generateCampaignInstructions(
    request: CampaignRequest,
    profile: StructuredClientProfile
  ): string[] {
    
    const instructions: string[] = [];

    // Base campaign type instructions
    switch (request.campaignType) {
      case 're_general_location':
        instructions.push('Focus on location-based benefits and neighborhood appeal');
        instructions.push('Emphasize community features and local lifestyle advantages');
        instructions.push('Use location-specific keywords and area identifiers');
        break;
      
      case 're_unit_type':
        instructions.push('Highlight unit-specific features and space utilization');
        instructions.push('Target demographic needs aligned with unit size');
        instructions.push('Emphasize lifestyle benefits of the specific unit configuration');
        break;
      
      case 're_proximity':
        instructions.push('Emphasize convenience and accessibility to key destinations');
        instructions.push('Focus on commute benefits and transportation advantages');
        instructions.push('Highlight time-saving and lifestyle convenience factors');
        break;
    }

    // Brand voice instructions
    if (profile.brandVoice.tone.length > 0) {
      instructions.push(`Maintain ${profile.brandVoice.tone.join(' and ')} tone throughout all copy`);
    }

    // Demographic-specific instructions
    if (profile.demographics.ageRange.includes('18-26') || profile.demographics.ageRange.includes('25-35')) {
      instructions.push('Use modern, dynamic language that appeals to younger demographics');
    }
    if (profile.demographics.lifestyle.includes('Tech-savvy')) {
      instructions.push('Include references to smart features and technology amenities');
    }

    // Competition instructions
    if (profile.competitor.marketPosition === 'Premium') {
      instructions.push('Emphasize luxury features, exclusivity, and superior quality');
    } else if (profile.competitor.marketPosition === 'Value') {
      instructions.push('Focus on affordability, value proposition, and cost benefits');
    }

    return instructions;
  }

  /**
   * Generate ad group-specific guidance
   */
  private static generateAdGroupGuidance(
    request: CampaignRequest,
    profile: StructuredClientProfile
  ): string[] {
    
    const guidance: string[] = [];

    // Ad group type specific guidance based on campaign type
    const campaignType = request.campaignType;
    const adGroupType = request.adGroupType || 'distributed_focus';

    if (campaignType === 're_general_location') {
      if (adGroupType === 'distributed_focus') {
        guidance.push('DISTRIBUTED HEADLINES: Create headlines across ALL location focuses:');
        guidance.push('• Location General (5+ headlines): Broad city/area terms like "apartments in [city]"');
        guidance.push('• Location Specific (5+ headlines): Specific neighborhoods and district names');
        guidance.push('• Location Amenities (5+ headlines): Location + amenity combinations');
        guidance.push('Ensure variety across all three focus areas within the 15 headlines');
      } else {
        switch (adGroupType) {
          case 'location_general':
            guidance.push('Use broad location terms like "apartments in [city]"');
            guidance.push('Focus on city-wide lifestyle and convenience benefits');
            break;
          case 'location_specific':
            guidance.push('Target specific neighborhoods and area names');
            guidance.push('Highlight unique neighborhood characteristics');
            break;
          case 'location_amenities':
            guidance.push('Combine location with specific amenity keywords');
            guidance.push('Emphasize lifestyle benefits of amenities + location combination');
            break;
        }
      }
    } else if (campaignType === 're_unit_type') {
      switch (adGroupType) {
        case 'studio':
          guidance.push('Target efficiency-focused keywords and space optimization');
          guidance.push('Appeal to budget-conscious and location-prioritizing renters');
          break;
        case '1br':
          guidance.push('Focus on work-life balance and personal space benefits');
          guidance.push('Target young professionals and couples');
          break;
        case '2br':
        case '3br':
        case '4br_plus':
          guidance.push('Emphasize family-friendly features and space for growth');
          guidance.push('Target families, roommates, and space-needing professionals');
          break;
      }
    } else if (campaignType === 're_proximity') {
      // Simplified 3-step proximity approach 
      guidance.push('🎯 STREAMLINED PROXIMITY STRATEGY:');
      guidance.push('• **Step 1**: Discover the most prestigious nearby destinations using Google Maps');
      guidance.push('• **Step 2**: Transform locations into lifestyle headlines ("Walk to [School] Daily" vs "Near [School]")');
      guidance.push('• **Step 3**: Position convenience as premium lifestyle advantage');
      guidance.push('');
      guidance.push('Focus on recognizable place names that create instant credibility and appeal');
      guidance.push('Convert proximity facts into daily lifestyle benefits and time-saving advantages');
    }

    return guidance;
  }


  /**
   * Filter amenities based on campaign type relevance
   */
  private static filterAmenitiesByCampaign(amenities: string[], request: CampaignRequest): string[] {
    // For unit-type campaigns, prioritize unit-specific amenities
    if (request.campaignType === 're_unit_type') {
      const unitAmenities = amenities.filter(amenity => 
        amenity.toLowerCase().includes('unit') || 
        amenity.toLowerCase().includes('kitchen') ||
        amenity.toLowerCase().includes('bathroom') ||
        amenity.toLowerCase().includes('laundry') ||
        amenity.toLowerCase().includes('dishwasher') ||
        amenity.toLowerCase().includes('air conditioning') ||
        amenity.toLowerCase().includes('hardwood') ||
        amenity.toLowerCase().includes('balcony')
      );
      
      if (unitAmenities.length > 0) {
        return unitAmenities.slice(0, 5); // Top 5 unit-relevant amenities
      }
    }

    // For proximity campaigns, prioritize location-relevant amenities
    if (request.campaignType === 're_proximity') {
      const locationAmenities = amenities.filter(amenity => 
        amenity.toLowerCase().includes('parking') || 
        amenity.toLowerCase().includes('garage') ||
        amenity.toLowerCase().includes('transit') ||
        amenity.toLowerCase().includes('walkable')
      );
      
      if (locationAmenities.length > 0) {
        return locationAmenities.slice(0, 5);
      }
    }

    // Return top amenities for general campaigns
    return amenities.slice(0, 6);
  }

  /**
   * Calculate overall relevance score based on section scores and campaign weights
   */
  private static calculateOverallRelevanceScore(
    sections: StructuredCampaignContext['contextSections'],
    campaignType: string
  ): number {
    
    const weights = this.CAMPAIGN_TYPE_WEIGHTS[campaignType as keyof typeof this.CAMPAIGN_TYPE_WEIGHTS] ||
                   this.CAMPAIGN_TYPE_WEIGHTS.re_general_location;

    let weightedScore = 0;
    
    weightedScore += sections.brandVoice.relevanceScore * weights.brandVoice;
    weightedScore += sections.targetAudience.relevanceScore * weights.targetAudience;
    weightedScore += sections.propertyHighlights.relevanceScore * weights.propertyHighlights;
    weightedScore += sections.locationBenefits.relevanceScore * weights.locationBenefits;
    weightedScore += sections.competitiveAdvantages.relevanceScore * weights.competitiveAdvantages;
    weightedScore += sections.pricingStrategy.relevanceScore * weights.pricingStrategy;

    return Math.round(weightedScore);
  }

  /**
   * Determine context strength based on overall relevance score
   */
  private static determineContextStrength(score: number): 'strong' | 'moderate' | 'weak' {
    if (score >= 70) return 'strong';
    if (score >= 40) return 'moderate';
    return 'weak';
  }

  /**
   * Generate a formatted context string for prompt generation
   */
  static generateFormattedContext(context: StructuredCampaignContext): string {
    const sections = context.contextSections;
    
    let formattedContext = `=== CAMPAIGN CONTEXT (${context.campaignType.toUpperCase()} - ${context.adGroupType.toUpperCase()}) ===\n`;
    formattedContext += `Context Strength: ${context.contextStrength.toUpperCase()} (Score: ${context.overallRelevanceScore}/100)\n\n`;

    // Add high priority sections first
    Object.entries(sections).forEach(([key, section]) => {
      if (section.priority === 'high') {
        formattedContext += `**${section.title.toUpperCase()}** [Priority: ${section.priority.toUpperCase()}, Score: ${section.relevanceScore}]\n`;
        formattedContext += `${section.content}\n\n`;
      }
    });

    // Add medium priority sections
    Object.entries(sections).forEach(([key, section]) => {
      if (section.priority === 'medium') {
        formattedContext += `**${section.title}** [Priority: ${section.priority}, Score: ${section.relevanceScore}]\n`;
        formattedContext += `${section.content}\n\n`;
      }
    });

    // Add campaign-specific instructions
    if (context.campaignSpecificInstructions.length > 0) {
      formattedContext += `**CAMPAIGN INSTRUCTIONS:**\n`;
      context.campaignSpecificInstructions.forEach((instruction, index) => {
        formattedContext += `${index + 1}. ${instruction}\n`;
      });
      formattedContext += '\n';
    }

    // Add ad group guidance
    if (context.adGroupSpecificGuidance.length > 0) {
      formattedContext += `**AD GROUP GUIDANCE:**\n`;
      context.adGroupSpecificGuidance.forEach((guidance, index) => {
        formattedContext += `${index + 1}. ${guidance}\n`;
      });
      formattedContext += '\n';
    }

    // Add keyword strategy
    if (context.keywordStrategy.length > 0) {
      formattedContext += `**KEYWORD STRATEGY RECOMMENDATIONS:**\n`;
      context.keywordStrategy.forEach((strategy: string, index: number) => {
        formattedContext += `${index + 1}. ${strategy}\n`;
      });
    }

    return formattedContext;
  }

  /**
   * Generate context summary for logging/debugging
   */
  static generateContextSummary(context: StructuredCampaignContext): object {
    return {
      campaignType: context.campaignType,
      adGroupType: context.adGroupType,
      overallRelevanceScore: context.overallRelevanceScore,
      contextStrength: context.contextStrength,
      sectionScores: {
        brandVoice: context.contextSections.brandVoice.relevanceScore,
        targetAudience: context.contextSections.targetAudience.relevanceScore,
        propertyHighlights: context.contextSections.propertyHighlights.relevanceScore,
        locationBenefits: context.contextSections.locationBenefits.relevanceScore,
        competitiveAdvantages: context.contextSections.competitiveAdvantages.relevanceScore,
        pricingStrategy: context.contextSections.pricingStrategy.relevanceScore
      },
      sectionPriorities: {
        high: Object.values(context.contextSections).filter(s => s.priority === 'high').length,
        medium: Object.values(context.contextSections).filter(s => s.priority === 'medium').length,
        low: Object.values(context.contextSections).filter(s => s.priority === 'low').length
      },
      instructionCounts: {
        campaignInstructions: context.campaignSpecificInstructions.length,
        adGroupGuidance: context.adGroupSpecificGuidance.length,
        keywordStrategy: context.keywordStrategy.length
      }
    };
  }
} 