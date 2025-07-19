import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';
import { MultiQueryGenerator, MultiQueryResult } from '@/lib/context/MultiQueryGenerator';
import { ChunkClassifier, CategorizedChunks } from '@/lib/context/ChunkClassifier';
import { ClientProfileManager, ClientIntakeData, StructuredClientProfile } from '@/lib/context/ClientProfileManager';
import { CampaignContextBuilder, StructuredCampaignContext } from '@/lib/context/CampaignContextBuilder';
import { EnhancedPromptGenerator } from '@/lib/context/EnhancedPromptGenerator';

// Initialize OpenAI client
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

// Real Estate Campaign Types and Ad Group Structure
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

// Simplified interface for auto-extraction approach
interface SimplifiedCampaignRequest {
  clientId: string;
  campaignType: keyof typeof RE_CAMPAIGN_TYPES;
  adGroupType?: string; // Optional for campaigns that use distributed focuses
  campaignName: string;
}

// Auto-extracted campaign details
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
  keywords: {
    exact_match: string[];
    phrase_match: string[];
    broad_match: string[];
    negative_keywords: string[];
  };
  final_url_paths: string[];
  character_validation: {
    headlines_valid: AdCopyValidationResult[];
    descriptions_valid: AdCopyValidationResult[];
  };
}

// Character limit validation with minimum and maximum requirements
class AdCopyValidator {
  static validateHeadlines(headlines: string[]): AdCopyValidationResult[] {
    return headlines.map(h => ({
      text: h,
      valid: h.length >= 20 && h.length <= 30, // Min 20, Max 30 characters
      length: h.length,
      truncated: h.length > 30 ? h.substring(0, 30) : undefined
    }));
  }
  
  static validateDescriptions(descriptions: string[]): AdCopyValidationResult[] {
    return descriptions.map(d => ({
      text: d,
      valid: d.length >= 65 && d.length <= 90, // Min 65, Max 90 characters
      length: d.length,
      truncated: d.length > 90 ? d.substring(0, 90) : undefined
    }));
  }
}

/**
 * Auto-extract campaign details from vector chunks and client profile
 */
class CampaignDetailsExtractor {
  static extractCampaignDetails(
    categorizedChunks: CategorizedChunks,
    clientProfile: StructuredClientProfile,
    campaignType: string,
    adGroupType: string,
    clientIntake?: ClientIntakeData | null
  ): ExtractedCampaignDetails {
    
    const extracted: ExtractedCampaignDetails = {
      location: this.extractLocation(categorizedChunks, clientProfile, clientIntake),
      priceRange: this.extractPriceRange(categorizedChunks, clientProfile),
      targetDemographic: this.extractTargetDemographic(categorizedChunks, clientProfile),
      additionalContext: this.extractAdditionalContext(categorizedChunks, clientProfile)
    };

    // Extract campaign-specific details
    if (campaignType === 're_unit_type') {
      extracted.unitDetails = this.extractUnitDetails(categorizedChunks, clientProfile, adGroupType);
    }

    if (campaignType === 're_proximity') {
      extracted.proximityTargets = this.extractProximityTargets(categorizedChunks, clientProfile);
    }

    // Extract special offers from client profile or chunks
    extracted.specialOffers = this.extractSpecialOffers(categorizedChunks, clientProfile);

    return extracted;
  }

  private static extractLocation(categorizedChunks: CategorizedChunks, clientProfile: StructuredClientProfile, clientIntake?: ClientIntakeData | null): 
    { city: string; state: string; zipCode?: string; county?: string } {
    
    let city = '';
    let state = '';
    let zipCode = '';
    let county = '';

    // PRIORITY 1: Parse from structured client intake address if available
    if (clientIntake?.community_address) {
      const addressParts = this.parseAddress(clientIntake.community_address);
      if (addressParts.city && addressParts.state) {
        console.log(`[RE-CAMPAIGN] Using structured address: ${clientIntake.community_address}`);
        return {
          city: addressParts.city,
          state: addressParts.state,
          zipCode: addressParts.zipCode,
          county: addressParts.county
        };
      }
    }

    // PRIORITY 2: Extract from vector chunks (fallback)
    console.log(`[RE-CAMPAIGN] No structured address found, parsing from vector chunks`);
    const locationKeywords = ['city', 'located', 'downtown', 'area', 'district', 'neighborhood'];

    // Search through local area chunks for location information
    for (const chunk of categorizedChunks.localArea) {
      const content = chunk.content.toLowerCase();
      
      // Look for city patterns
      const cityMatch = content.match(/(?:in|located in|downtown|near)\s+([A-Za-z\s]+?)(?:,|\s+(?:california|ca|texas|tx|florida|fl|new york|ny))/i);
      if (cityMatch && !city) {
        city = cityMatch[1].trim();
      }

      // Look for state patterns with word boundaries to avoid false matches
      const stateMatch = content.match(/\b(?:california|texas|florida|nevada|arizona|colorado|washington|oregon)\b|\b(?:ca|tx|fl|ny|nv|az|co|wa|or)\b(?=\s|,|$)/i);
      if (stateMatch && !state) {
        const stateStr = stateMatch[0].toLowerCase();
        state = this.normalizeState(stateStr);
      }

      // Look for zip codes
      const zipMatch = content.match(/\b(\d{5})\b/);
      if (zipMatch && !zipCode) {
        zipCode = zipMatch[1];
      }

      // Look for county
      const countyMatch = content.match(/([A-Za-z\s]+?)\s+county/i);
      if (countyMatch && !county) {
        county = countyMatch[1].trim() + ' County';
      }
    }

    // Also check property chunks for location info
    for (const chunk of categorizedChunks.propertyFeatures) {
      const content = chunk.content.toLowerCase();
      
      if (!city) {
        const cityMatch = content.match(/(?:property|building|community).*?(?:in|located in|at)\s+([A-Za-z\s]+?)(?:,|\s+(?:california|ca|texas|tx))/i);
        if (cityMatch) {
          city = cityMatch[1].trim();
        }
      }

      if (!state) {
        const stateMatch = content.match(/\b(?:california|texas|florida|nevada|arizona|colorado|washington|oregon)\b|\b(?:ca|tx|fl|ny|nv|az|co|wa|or)\b(?=\s|,|$)/i);
        if (stateMatch) {
          state = this.normalizeState(stateMatch[0].toLowerCase());
        }
      }
    }

    // Fallback to common defaults or intake data patterns
    if (!city && !state) {
      // Try to infer from other contextual clues
      const allContent = [
        ...categorizedChunks.localArea,
        ...categorizedChunks.propertyFeatures,
        ...categorizedChunks.demographics
      ].map(c => c.content).join(' ').toLowerCase();

      // Look for major city indicators
      if (allContent.includes('san diego') || allContent.includes('sd ')) {
        city = 'San Diego';
        state = 'CA';
      } else if (allContent.includes('los angeles') || allContent.includes('la ')) {
        city = 'Los Angeles';
        state = 'CA';
      } else if (allContent.includes('san francisco') || allContent.includes('sf ')) {
        city = 'San Francisco';
        state = 'CA';
      } else if (allContent.includes('miami')) {
        city = 'Miami';
        state = 'FL';
      } else if (allContent.includes('austin')) {
        city = 'Austin';
        state = 'TX';
      } else {
        // Ultimate fallback
        city = 'San Diego';
        state = 'CA';
      }
    }

    return {
      city: city || 'San Diego',
      state: state || 'CA',
      zipCode: zipCode || undefined,
      county: county || undefined
    };
  }

  private static normalizeState(stateStr: string): string {
    const stateMap: { [key: string]: string } = {
      'california': 'CA',
      'ca': 'CA',
      'texas': 'TX',
      'tx': 'TX',
      'florida': 'FL',
      'fl': 'FL',
      'new york': 'NY',
      'ny': 'NY',
      'nevada': 'NV',
      'nv': 'NV',
      'arizona': 'AZ',
      'az': 'AZ',
      'colorado': 'CO',
      'co': 'CO',
      'washington': 'WA',
      'wa': 'WA',
      'oregon': 'OR',
      'or': 'OR'
    };
    return stateMap[stateStr.toLowerCase()] || stateStr.toUpperCase();
  }

  /**
   * Parse a structured address string to extract city, state, and zip code
   * Expected format: "Street Address City, State ZipCode"
   * Example: "3585 Aero Court San Diego, CA 92123"
   */
  private static parseAddress(address: string): { city: string; state: string; zipCode?: string; county?: string } {
    console.log(`[RE-CAMPAIGN] Parsing address: "${address}"`);
    
    // Regex to match: "Street Address City, State ZipCode"
    // This handles formats like:
    // "3585 Aero Court San Diego, CA 92123"
    // "123 Main Street Los Angeles, California 90210"
    const addressPattern = /^(.+?)\s+([^,]+),\s*([A-Za-z\s]+?)\s+(\d{5}(?:-\d{4})?)?\s*$/;
    const match = address.match(addressPattern);
    
    if (match) {
      const [, streetAddress, city, stateStr, zipCode] = match;
      const normalizedState = this.normalizeState(stateStr.trim());
      
      console.log(`[RE-CAMPAIGN] Parsed address - City: "${city.trim()}", State: "${normalizedState}", Zip: "${zipCode || 'N/A'}"`);
      
      return {
        city: city.trim(),
        state: normalizedState,
        zipCode: zipCode?.trim(),
        county: undefined
      };
    }
    
    // Fallback: try simpler pattern without street address
    // Format: "City, State ZipCode"
    const simplePattern = /^([^,]+),\s*([A-Za-z\s]+?)\s+(\d{5}(?:-\d{4})?)?\s*$/;
    const simpleMatch = address.match(simplePattern);
    
    if (simpleMatch) {
      const [, city, stateStr, zipCode] = simpleMatch;
      const normalizedState = this.normalizeState(stateStr.trim());
      
      console.log(`[RE-CAMPAIGN] Parsed simple address - City: "${city.trim()}", State: "${normalizedState}", Zip: "${zipCode || 'N/A'}"`);
      
      return {
        city: city.trim(),
        state: normalizedState,
        zipCode: zipCode?.trim(),
        county: undefined
      };
    }
    
    console.log(`[RE-CAMPAIGN] Could not parse address format: "${address}"`);
    return { city: '', state: '', zipCode: undefined, county: undefined };
  }

  private static extractPriceRange(categorizedChunks: CategorizedChunks, clientProfile: StructuredClientProfile): string | undefined {
    // First check client profile
    if (clientProfile.property.pricePoint) {
      return clientProfile.property.pricePoint;
    }

    // Search chunks for pricing information
    const priceKeywords = ['rent', 'price', 'starting', 'from', '$', 'monthly', 'per month'];
    const allChunks = [
      ...categorizedChunks.propertyFeatures,
      ...categorizedChunks.general
    ];

    for (const chunk of allChunks) {
      const content = chunk.content.toLowerCase();
      
      // Look for price patterns
      const priceMatch = content.match(/(?:starting|from|rent|price).*?\$([0-9,]+).*?(?:month|monthly|\/mo)/i);
      if (priceMatch) {
        const price = priceMatch[1].replace(',', '');
        return `Starting from $${price}/month`;
      }

      // Look for price ranges
      const rangeMatch = content.match(/\$([0-9,]+)\s*[-–]\s*\$([0-9,]+)/i);
      if (rangeMatch) {
        const low = rangeMatch[1].replace(',', '');
        const high = rangeMatch[2].replace(',', '');
        return `$${low} - $${high}/month`;
      }
    }

    return undefined;
  }

  private static extractTargetDemographic(categorizedChunks: CategorizedChunks, clientProfile: StructuredClientProfile): string | undefined {
    // First check client profile
    if (clientProfile.demographics.primaryAudience) {
      return clientProfile.demographics.primaryAudience;
    }

    // Combine demographic insights from chunks
    const demographics = categorizedChunks.demographics;
    const insights: string[] = [];

    for (const chunk of demographics) {
      const content = chunk.content.toLowerCase();
      
      // Look for demographic descriptors
      if (content.includes('young professional')) insights.push('Young professionals');
      if (content.includes('family') || content.includes('families')) insights.push('Families');
      if (content.includes('student')) insights.push('Students');
      if (content.includes('tech') || content.includes('technology')) insights.push('Tech workers');
      if (content.includes('military')) insights.push('Military personnel');
      if (content.includes('retiree') || content.includes('senior')) insights.push('Retirees');
      if (content.includes('couple')) insights.push('Couples');
      if (content.includes('single')) insights.push('Singles');
    }

    // Remove duplicates and combine
    const uniqueInsights = Array.from(new Set(insights));
    return uniqueInsights.length > 0 ? uniqueInsights.join(', ') : undefined;
  }

  private static extractUnitDetails(
    categorizedChunks: CategorizedChunks, 
    clientProfile: StructuredClientProfile, 
    adGroupType: string
  ): { bedrooms?: number; bathrooms?: number; sqft?: string; unitType?: string } | undefined {
    
    const unitDetails: { bedrooms?: number; bathrooms?: number; sqft?: string; unitType?: string } = {};

    // Derive from ad group type first
    if (adGroupType === 'studio') {
      unitDetails.bedrooms = 0;
      unitDetails.bathrooms = 1;
      unitDetails.unitType = 'Studio';
    } else if (adGroupType === '1br') {
      unitDetails.bedrooms = 1;
      unitDetails.bathrooms = 1;
      unitDetails.unitType = 'Apartment';
    } else if (adGroupType === '2br') {
      unitDetails.bedrooms = 2;
      unitDetails.bathrooms = 2;
      unitDetails.unitType = 'Apartment';
    } else if (adGroupType === '3br') {
      unitDetails.bedrooms = 3;
      unitDetails.bathrooms = 2;
      unitDetails.unitType = 'Apartment';
    } else if (adGroupType === '4br_plus') {
      unitDetails.bedrooms = 4;
      unitDetails.bathrooms = 3;
      unitDetails.unitType = 'Apartment';
    }

    // Try to extract square footage from chunks
    const propertyChunks = categorizedChunks.propertyFeatures;
    for (const chunk of propertyChunks) {
      const content = chunk.content;
      
      // Look for square footage
      const sqftMatch = content.match(/(\d{3,4})\s*(?:sq\.?\s*ft\.?|square feet|sqft)/i);
      if (sqftMatch && !unitDetails.sqft) {
        unitDetails.sqft = sqftMatch[1];
      }

      // Look for unit type refinements
      if (content.toLowerCase().includes('townhome') || content.toLowerCase().includes('townhouse')) {
        unitDetails.unitType = 'Townhome';
      } else if (content.toLowerCase().includes('loft')) {
        unitDetails.unitType = 'Loft';
      } else if (content.toLowerCase().includes('penthouse')) {
        unitDetails.unitType = 'Penthouse';
      }
    }

    return Object.keys(unitDetails).length > 0 ? unitDetails : undefined;
  }

  private static extractProximityTargets(categorizedChunks: CategorizedChunks, clientProfile: StructuredClientProfile): string[] | undefined {
    const proximityTargets: string[] = [];
    const localAreaChunks = categorizedChunks.localArea;

    for (const chunk of localAreaChunks) {
      const content = chunk.content;
      
      // Look for "near" or "close to" patterns
      const nearMatches = content.match(/(?:near|close to|walking distance to|minutes from)\s+([A-Za-z\s&]+?)(?:\.|,|;|\n|$)/gi);
      if (nearMatches) {
        nearMatches.forEach(match => {
          const target = match.replace(/^(?:near|close to|walking distance to|minutes from)\s+/i, '').trim();
          if (target.length > 2 && target.length < 50) {
            proximityTargets.push(target);
          }
        });
      }

      // Look for landmark patterns
      const landmarkKeywords = ['university', 'college', 'mall', 'airport', 'beach', 'park', 'downtown', 'station', 'hospital', 'school'];
      landmarkKeywords.forEach(keyword => {
        const regex = new RegExp(`([A-Za-z\\s]+${keyword}[A-Za-z\\s]*)`, 'gi');
        const matches = content.match(regex);
        if (matches) {
          matches.forEach(match => {
            const cleaned = match.trim();
            if (cleaned.length > 5 && cleaned.length < 40) {
              proximityTargets.push(cleaned);
            }
          });
        }
      });
    }

    // Remove duplicates and return top 5
    const uniqueTargets = Array.from(new Set(proximityTargets));
    return uniqueTargets.length > 0 ? uniqueTargets.slice(0, 5) : undefined;
  }

  private static extractSpecialOffers(categorizedChunks: CategorizedChunks, clientProfile: StructuredClientProfile): string | undefined {
    // Check client profile first
    if (clientProfile.property.specialOffers.length > 0) {
      return clientProfile.property.specialOffers.join(', ');
    }

    // Search chunks for offers
    const offerKeywords = ['free', 'off', 'special', 'promotion', 'deal', 'incentive', 'bonus'];
    const allChunks = [
      ...categorizedChunks.propertyFeatures,
      ...categorizedChunks.general
    ];

    for (const chunk of allChunks) {
      const content = chunk.content.toLowerCase();
      
      // Look for specific offer patterns
      if (content.includes('month free') || content.includes('months free')) {
        const monthMatch = content.match(/(\d+)\s*months?\s*free/i);
        if (monthMatch) {
          return `${monthMatch[1]} month${monthMatch[1] === '1' ? '' : 's'} free rent`;
        }
      }

      if (content.includes('deposit') && content.includes('waived')) {
        return 'Waived security deposit';
      }

      if (content.includes('move-in special') || content.includes('move in special')) {
        return 'Move-in specials available';
      }
    }

    return undefined;
  }

  private static extractAdditionalContext(categorizedChunks: CategorizedChunks, clientProfile: StructuredClientProfile): string | undefined {
    const contextElements: string[] = [];

    // Extract key amenities
    if (clientProfile.property.amenities.length > 0) {
      const topAmenities = clientProfile.property.amenities.slice(0, 3);
      contextElements.push(`Key amenities: ${topAmenities.join(', ')}`);
    }

    // Extract location advantages
    if (clientProfile.property.locationAdvantages.length > 0) {
      const topAdvantages = clientProfile.property.locationAdvantages.slice(0, 2);
      contextElements.push(`Location benefits: ${topAdvantages.join(', ')}`);
    }

    // Extract unique features
    if (clientProfile.property.uniqueFeatures.length > 0) {
      contextElements.push(`Unique features: ${clientProfile.property.uniqueFeatures.join(', ')}`);
    }

    return contextElements.length > 0 ? contextElements.join('. ') : undefined;
  }
}

/*
 * COMPREHENSIVE LOGGING ENABLED:
 * - Multi-query vector search results and chunk classification
 * - Extracted campaign details (location, pricing, demographics, etc.)
 * - Client profile summary (brand voice, amenities, competitors, completeness score)
 * - Campaign context scores and section relevance
 * - Enhanced prompt preview (first 500 chars) sent to OpenAI Assistant
 * - OpenAI Assistant response preview and JSON parsing
 * - Character validation results for Google Ads compliance
 * - Final generation quality scores
 * 
 * To enable FULL prompt/response logging, change ENABLE_FULL_*_LOGGING to true
 */
export async function POST(req: NextRequest) {
  try {
    const body: SimplifiedCampaignRequest = await req.json();
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

    console.log(`[RE-CAMPAIGN] Starting auto-extraction campaign generation for client ${clientId}`);
    // For campaigns that don't require ad group focus, use a default value for logging/processing
    const effectiveAdGroupType = adGroupType || 'distributed_focus';
    console.log(`[RE-CAMPAIGN] Campaign: ${campaignName} | Type: ${campaignType} | Ad Group: ${effectiveAdGroupType}`);

    // === Step 1: Multi-Query Intelligent Context Retrieval (Phase 1) ===
    console.log(`[RE-CAMPAIGN] Starting Phase 1 intelligent context retrieval`);
    
    // Create a mock request for query generation (we'll derive real values later)
    const mockRequest = {
      clientId,
      campaignType,
      adGroupType: effectiveAdGroupType,
      location: { city: 'Auto-Extract', state: 'Auto-Extract' }
    };
    
    // Generate 4 specialized search queries
    const multiQueries = MultiQueryGenerator.generateMultipleQueries(mockRequest);
    const queryLabels = MultiQueryGenerator.getQueryLabels();
    const queryArray = MultiQueryGenerator.getQueryArray(multiQueries);
    
    console.log(`[RE-CAMPAIGN] Generated ${queryArray.length} specialized queries for auto-extraction:`);
    queryArray.forEach((query, index) => {
      console.log(`[RE-CAMPAIGN] ${queryLabels[index]}: ${query}`);
    });
    
    // Execute multiple vector searches in parallel
    const embeddingPromises = queryArray.map(query => 
      openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: query,
      })
    );
    
    const embeddingResponses = await Promise.all(embeddingPromises);
    const queryEmbeddings = embeddingResponses.map(response => response.data[0].embedding);
    
    // Execute parallel vector searches
    const searchPromises = queryEmbeddings.map(embedding =>
      supabase.rpc('match_chunks', {
        client_id_filter: clientId,
        query_embedding: embedding,
        match_threshold: 0.3,
        match_count: 15, // 15 chunks per query = 60 total max
      })
    );
    
    const searchResults = await Promise.all(searchPromises);
    
    // Check for errors in any of the searches
    const searchErrors = searchResults.filter(result => result.error);
    if (searchErrors.length > 0) {
      console.error('[RE-CAMPAIGN] Vector search errors:', searchErrors);
      const firstError = searchErrors[0]?.error;
      throw new Error(`Vector search failed: ${firstError?.message || 'Unknown error'}`);
    }
    
    // Combine and deduplicate chunks from all searches
    const allChunks = searchResults.flatMap(result => result.data || []);
    const uniqueChunks = Array.from(
      new Map(allChunks.map(chunk => [chunk.content, chunk])).values()
    );
    
    console.log(`[RE-CAMPAIGN] Retrieved ${uniqueChunks.length} unique chunks from ${queryArray.length} specialized searches`);
    
    // === Step 2: Intelligent Chunk Classification (Phase 1) ===
    console.log(`[RE-CAMPAIGN] Classifying chunks by type and relevance`);
    
    const categorizedChunks = ChunkClassifier.classifyChunks(uniqueChunks);
    const categorySummary = ChunkClassifier.getCategorySummary(categorizedChunks);
    
    console.log(`[RE-CAMPAIGN] Chunk classification summary:`, categorySummary);
    
    // === Step 3: Build Client Profile (Phase 2) ===
    console.log(`[RE-CAMPAIGN] Building comprehensive client profile`);
    
    // Get client intake data
    const { data: clientIntake, error: intakeError } = await supabase
      .from('client_intake')
      .select('*')
      .eq('client_id', clientId)
      .eq('intake_completed', true)
      .single();

    if (intakeError && intakeError.code !== 'PGRST116') {
      console.warn('[RE-CAMPAIGN] Could not retrieve client intake data:', intakeError);
    }

    // Build comprehensive client profile
    const clientProfile = ClientProfileManager.buildClientProfile(
      clientIntake as ClientIntakeData | null, 
      categorizedChunks
    );
    
    console.log(`[RE-CAMPAIGN] ========== CLIENT PROFILE SUMMARY ==========`);
    console.log(`[RE-CAMPAIGN] Completeness Score: ${clientProfile.completenessScore}%`);
    console.log(`[RE-CAMPAIGN] Has Intake Data: ${clientProfile.hasIntakeData}`);
    console.log(`[RE-CAMPAIGN] Has Vector Data: ${clientProfile.hasVectorData}`);
    console.log(`[RE-CAMPAIGN] Community Name: ${clientProfile.property.communityName || 'Not found'}`);
    console.log(`[RE-CAMPAIGN] Property Type: ${clientProfile.property.propertyType || 'Not found'}`);
    console.log(`[RE-CAMPAIGN] Brand Voice Tone: [${clientProfile.brandVoice.tone.join(', ')}]`);
    console.log(`[RE-CAMPAIGN] Primary Audience: ${clientProfile.demographics.primaryAudience || 'Not found'}`);
    console.log(`[RE-CAMPAIGN] Key Amenities: [${clientProfile.property.amenities.slice(0, 5).join(', ')}]${clientProfile.property.amenities.length > 5 ? '...' : ''}`);
    console.log(`[RE-CAMPAIGN] Competitors: [${clientProfile.competitor.competitors.slice(0, 3).join(', ')}]${clientProfile.competitor.competitors.length > 3 ? '...' : ''}`);
    console.log(`[RE-CAMPAIGN] ===============================================`);

    // === Step 4: Auto-Extract Campaign Details ===
    console.log(`[RE-CAMPAIGN] Auto-extracting campaign details from vector database`);
    
    const extractedDetails = CampaignDetailsExtractor.extractCampaignDetails(
      categorizedChunks,
      clientProfile,
      campaignType,
      effectiveAdGroupType,
      clientIntake
    );
    
    console.log(`[RE-CAMPAIGN] ========== EXTRACTED CAMPAIGN DETAILS ==========`);
    console.log(`[RE-CAMPAIGN] Location: ${extractedDetails.location.city}, ${extractedDetails.location.state}`);
    console.log(`[RE-CAMPAIGN] Price Range: ${extractedDetails.priceRange || 'Not found'}`);
    console.log(`[RE-CAMPAIGN] Target Demographic: ${extractedDetails.targetDemographic || 'Not found'}`);
    console.log(`[RE-CAMPAIGN] Unit Details:`, extractedDetails.unitDetails || 'Not applicable');
    console.log(`[RE-CAMPAIGN] Proximity Targets:`, extractedDetails.proximityTargets || 'Not applicable');
    console.log(`[RE-CAMPAIGN] Special Offers: ${extractedDetails.specialOffers || 'Not found'}`);
    console.log(`[RE-CAMPAIGN] Additional Context: ${extractedDetails.additionalContext || 'Not found'}`);
    console.log(`[RE-CAMPAIGN] ================================================`);

    // === Step 5: Build Campaign Context with Extracted Details ===
    console.log(`[RE-CAMPAIGN] Building campaign context with extracted details`);
    
    // Create full campaign request with extracted details
    const fullCampaignRequest = {
      clientId,
      campaignType,
      adGroupType: effectiveAdGroupType,
      location: extractedDetails.location,
      unitDetails: extractedDetails.unitDetails,
      proximityTargets: extractedDetails.proximityTargets,
      priceRange: extractedDetails.priceRange,
      specialOffers: extractedDetails.specialOffers,
      targetDemographic: extractedDetails.targetDemographic,
      additionalContext: extractedDetails.additionalContext
    };

    const campaignContext = CampaignContextBuilder.buildCampaignContext(fullCampaignRequest, clientProfile);
    
    console.log(`[RE-CAMPAIGN] ========== CAMPAIGN CONTEXT SUMMARY ==========`);
    console.log(`[RE-CAMPAIGN] Overall Relevance Score: ${campaignContext.overallRelevanceScore}/100`);
    console.log(`[RE-CAMPAIGN] Context Strength: ${campaignContext.contextStrength}`);
    console.log(`[RE-CAMPAIGN] Brand Voice Section Score: ${campaignContext.contextSections.brandVoice.relevanceScore}`);
    console.log(`[RE-CAMPAIGN] Target Audience Section Score: ${campaignContext.contextSections.targetAudience.relevanceScore}`);
    console.log(`[RE-CAMPAIGN] Property Highlights Section Score: ${campaignContext.contextSections.propertyHighlights.relevanceScore}`);
    console.log(`[RE-CAMPAIGN] Location Benefits Section Score: ${campaignContext.contextSections.locationBenefits.relevanceScore}`);
    console.log(`[RE-CAMPAIGN] Competitive Advantages Section Score: ${campaignContext.contextSections.competitiveAdvantages.relevanceScore}`);
    console.log(`[RE-CAMPAIGN] Pricing Strategy Section Score: ${campaignContext.contextSections.pricingStrategy.relevanceScore}`);
    console.log(`[RE-CAMPAIGN] Campaign Instructions: [${campaignContext.campaignSpecificInstructions.slice(0, 3).join(', ')}]${campaignContext.campaignSpecificInstructions.length > 3 ? '...' : ''}`);
    console.log(`[RE-CAMPAIGN] ===============================================`);

    // === Step 6: Enhanced Prompt Engineering (Phase 3) ===
    console.log(`[RE-CAMPAIGN] Generating enhanced prompt using auto-extracted context`);
    
    const prompt = EnhancedPromptGenerator.generateEnhancedPrompt(
      fullCampaignRequest,
      campaignContext,
      clientProfile
    );
    
    console.log(`[RE-CAMPAIGN] ========== ENHANCED PROMPT FOR OPENAI ASSISTANT ==========`);
    console.log(`[RE-CAMPAIGN] Prompt Length: ${prompt.length} characters`);
    console.log(`[RE-CAMPAIGN] Prompt Preview (first 500 chars):`);
    console.log(prompt.substring(0, 500) + (prompt.length > 500 ? '\n...[TRUNCATED FOR PREVIEW]...' : ''));
    console.log(`[RE-CAMPAIGN] ============================================================`);
    
    // To see the FULL prompt being sent to your assistant, change this to true
    const ENABLE_FULL_PROMPT_LOGGING = false;
    if (ENABLE_FULL_PROMPT_LOGGING) {
      console.log(`[RE-CAMPAIGN] ========== FULL PROMPT BEING SENT ==========`);
      console.log(prompt);
      console.log(`[RE-CAMPAIGN] ===============================================`);
    }

    // === Step 7: Generate Copy with OpenAI Assistant ===
    if (!process.env.OPENAI_ASSISTANT_ID) {
      throw new Error("OPENAI_ASSISTANT_ID environment variable is not set");
    }
    
    // Create thread
    const thread = await openai.beta.threads.create();
    if (!thread || !thread.id) {
      throw new Error("Failed to create OpenAI thread");
    }
    console.log(`[RE-CAMPAIGN] Thread created: ${thread.id}`);

    // Add message to thread
    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: prompt,
    });

    // Create and run the assistant
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: process.env.OPENAI_ASSISTANT_ID,
    });
    
    if (!run || !run.id) {
      throw new Error("Failed to create OpenAI run");
    }
    console.log(`[RE-CAMPAIGN] Run created: ${run.id}`);

    // Poll for completion
    let currentRun = run;
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds timeout

    while (['queued', 'in_progress'].includes(currentRun.status) && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log(`[RE-CAMPAIGN] Polling attempt ${attempts + 1}, status: ${currentRun.status}`);
      try {
        currentRun = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      } catch (retrieveError) {
        console.error(`[RE-CAMPAIGN] Error retrieving run status:`, retrieveError);
        throw new Error(`Failed to retrieve run status: ${retrieveError}`);
      }
      attempts++;
    }
    
    if (currentRun.status !== 'completed') {
      const errorDetails = currentRun.last_error?.message || 'Unknown error';
      console.error(`[RE-CAMPAIGN] Assistant run failed with status: ${currentRun.status}`, errorDetails);
      throw new Error(`Assistant failed to generate copy. Status: ${currentRun.status}. ${errorDetails}`);
    }

    // === Step 8: Extract and Parse Response ===
    console.log(`[RE-CAMPAIGN] ========== OPENAI ASSISTANT RESPONSE ==========`);
    const messages = await openai.beta.threads.messages.list(thread.id);
    const assistantMessage = messages.data.find((m: any) => m.role === 'assistant');

    if (!assistantMessage || assistantMessage.content[0].type !== 'text') {
        console.error(`[RE-CAMPAIGN] Assistant message structure:`, assistantMessage);
        throw new Error("Assistant did not return a valid text response.");
    }
    
    const responseText = assistantMessage.content[0].text.value;
    console.log(`[RE-CAMPAIGN] Raw Assistant Response Length: ${responseText.length} characters`);
    console.log(`[RE-CAMPAIGN] Raw Response Preview (first 1000 chars):`);
    console.log(responseText.substring(0, 1000) + (responseText.length > 1000 ? '\n...[TRUNCATED FOR PREVIEW]...' : ''));
    console.log(`[RE-CAMPAIGN] ================================================`);
    
    // To see the FULL assistant response, change this to true
    const ENABLE_FULL_RESPONSE_LOGGING = false;
    if (ENABLE_FULL_RESPONSE_LOGGING) {
      console.log(`[RE-CAMPAIGN] ========== FULL ASSISTANT RESPONSE ==========`);
      console.log(responseText);
      console.log(`[RE-CAMPAIGN] ===============================================`);
    }
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    
    console.log(`[RE-CAMPAIGN] ========== JSON EXTRACTION & PARSING ==========`);
    if (!jsonMatch) {
        console.error('[RE-CAMPAIGN] No JSON found in response. Full response:');
        console.error(responseText);
        throw new Error("Assistant did not return valid JSON.");
    }

    console.log(`[RE-CAMPAIGN] Extracted JSON Length: ${jsonMatch[0].length} characters`);
    console.log(`[RE-CAMPAIGN] JSON Preview (first 500 chars):`);
    console.log(jsonMatch[0].substring(0, 500) + (jsonMatch[0].length > 500 ? '\n...[TRUNCATED]...' : ''));

    let generatedCopy: RealEstateAdResponse;
    try {
      const parsedResponse = JSON.parse(jsonMatch[0]);
      console.log(`[RE-CAMPAIGN] JSON Parsing: SUCCESS`);
      
      // Validate the response structure
      console.log(`[RE-CAMPAIGN] Headlines Count: ${parsedResponse.headlines?.length || 0} (required: 15)`);
      console.log(`[RE-CAMPAIGN] Descriptions Count: ${parsedResponse.descriptions?.length || 0} (required: 4)`);
      console.log(`[RE-CAMPAIGN] Has Keywords: ${!!parsedResponse.keywords}`);
      console.log(`[RE-CAMPAIGN] Has Final URL Paths: ${!!parsedResponse.final_url_paths}`);
      
      if (!parsedResponse.headlines || !Array.isArray(parsedResponse.headlines) || parsedResponse.headlines.length !== 15) {
        throw new Error("Invalid response: Must have exactly 15 headlines");
      }
      if (!parsedResponse.descriptions || !Array.isArray(parsedResponse.descriptions) || parsedResponse.descriptions.length !== 4) {
        throw new Error("Invalid response: Must have exactly 4 descriptions");
      }
      
      generatedCopy = parsedResponse;
      console.log(`[RE-CAMPAIGN] Response Validation: PASSED`);
    } catch (parseError) {
      console.error('[RE-CAMPAIGN] JSON parse error:', parseError);
      console.error('[RE-CAMPAIGN] Extracted JSON that failed:');
      console.error(jsonMatch[0]);
      throw new Error("Generated copy is not valid JSON or doesn't meet requirements.");
    }
    console.log(`[RE-CAMPAIGN] ================================================`);

    // === Step 9: Validate Character Limits ===
    console.log(`[RE-CAMPAIGN] ========== CHARACTER VALIDATION ==========`);
    let headlineValidation = AdCopyValidator.validateHeadlines(generatedCopy.headlines);
    let descriptionValidation = AdCopyValidator.validateDescriptions(generatedCopy.descriptions);
    
    let validHeadlines = headlineValidation.filter(h => h.valid).length;
    let validDescriptions = descriptionValidation.filter(d => d.valid).length;
    
    console.log(`[RE-CAMPAIGN] Headlines Validation: ${validHeadlines}/15 valid (${((validHeadlines/15)*100).toFixed(1)}%)`);
    console.log(`[RE-CAMPAIGN] Descriptions Validation: ${validDescriptions}/4 valid (${((validDescriptions/4)*100).toFixed(1)}%)`);
    
    // === NEW: Automatic Retry for Invalid Headlines ===
    if (validHeadlines < 15) {
      console.log(`[RE-CAMPAIGN] ========== AUTOMATIC CORRECTION ATTEMPT ==========`);
      console.log(`[RE-CAMPAIGN] ${15 - validHeadlines} headlines are invalid. Requesting corrections...`);
      
      const invalidHeadlines = headlineValidation.filter(h => !h.valid);
      const invalidHeadlinesText = invalidHeadlines.map((h, i) => {
        const reason = h.length < 20 ? 'too short' : 'too long';
        const needed = h.length < 20 ? 20 - h.length : h.length - 30;
        return `${i+1}. "${h.text}" (${h.length} chars - ${reason}, need ${needed} ${h.length < 20 ? 'more' : 'fewer'} characters)`;
      }).join('\n');
      
      const correctionPrompt = `🚨 CRITICAL: CHARACTER VALIDATION FAILED 🚨

The following headlines do NOT meet the 20-30 character requirement:
${invalidHeadlinesText}

TASK: Fix ONLY the invalid headlines below. Keep all valid headlines unchanged.

REQUIREMENTS:
- EVERY headline MUST be 20-30 characters (count manually!)
- Add descriptive words to short headlines: "Downtown Apt" → "Luxury Downtown Apartment" 
- Shorten long headlines while keeping the key message
- Count characters including ALL spaces and punctuation

Return ONLY a JSON object with the corrected headlines array:
{
  "headlines": ["Corrected headline 1", "Corrected headline 2", ...]
}

Original headlines that need fixing:
${JSON.stringify(generatedCopy.headlines, null, 2)}`;

      try {
        // Create new thread for correction
        const correctionThread = await openai.beta.threads.create();
        
        await openai.beta.threads.messages.create(correctionThread.id, {
          role: 'user',
          content: correctionPrompt,
        });

        const correctionRun = await openai.beta.threads.runs.create(correctionThread.id, {
          assistant_id: process.env.OPENAI_ASSISTANT_ID,
        });

        // Poll for correction completion
        let currentCorrectionRun = correctionRun;
        let correctionAttempts = 0;
        const maxCorrectionAttempts = 30; // 30 seconds timeout

        while (['queued', 'in_progress'].includes(currentCorrectionRun.status) && correctionAttempts < maxCorrectionAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          currentCorrectionRun = await openai.beta.threads.runs.retrieve(correctionThread.id, correctionRun.id);
          correctionAttempts++;
        }

        if (currentCorrectionRun.status === 'completed') {
          const correctionMessages = await openai.beta.threads.messages.list(correctionThread.id);
          const correctionResponse = correctionMessages.data.find((m: any) => m.role === 'assistant');
          
          if (correctionResponse && correctionResponse.content[0].type === 'text') {
            const correctionText = correctionResponse.content[0].text.value;
            const correctionJsonMatch = correctionText.match(/\{[\s\S]*\}/);
            
            if (correctionJsonMatch) {
              try {
                const correctedData = JSON.parse(correctionJsonMatch[0]);
                if (correctedData.headlines && Array.isArray(correctedData.headlines) && correctedData.headlines.length === 15) {
                  console.log(`[RE-CAMPAIGN] Correction attempt successful, validating corrected headlines...`);
                  
                  // Update the generated copy with corrected headlines
                  generatedCopy.headlines = correctedData.headlines;
                  
                  // Re-validate
                  const newHeadlineValidation = AdCopyValidator.validateHeadlines(generatedCopy.headlines);
                  const newValidHeadlines = newHeadlineValidation.filter(h => h.valid).length;
                  
                  console.log(`[RE-CAMPAIGN] Post-correction validation: ${newValidHeadlines}/15 headlines valid`);
                  
                  // Update validation results
                  headlineValidation = newHeadlineValidation;
                  validHeadlines = newValidHeadlines;
                } else {
                  console.log(`[RE-CAMPAIGN] Correction response invalid - keeping original headlines`);
                }
              } catch (correctionParseError) {
                console.log(`[RE-CAMPAIGN] Failed to parse correction JSON - keeping original headlines`);
              }
            } else {
              console.log(`[RE-CAMPAIGN] No valid JSON in correction response - keeping original headlines`);
            }
          }
        } else {
          console.log(`[RE-CAMPAIGN] Correction attempt failed or timed out - keeping original headlines`);
        }
      } catch (correctionError) {
        console.log(`[RE-CAMPAIGN] Error during correction attempt:`, correctionError);
        console.log(`[RE-CAMPAIGN] Proceeding with original headlines`);
      }
      
      console.log(`[RE-CAMPAIGN] ================================================`);
    }
    
    if (validHeadlines < 15) {
      console.log(`[RE-CAMPAIGN] Invalid Headlines (must be 20-30 chars):`);
      headlineValidation.filter(h => !h.valid).forEach((h, i) => {
        const reason = h.length < 20 ? 'too short' : 'too long';
        console.log(`[RE-CAMPAIGN]   ${i+1}. "${h.text}" (${h.length} chars - ${reason})`);
      });
    }
    
    if (validDescriptions < 4) {
      console.log(`[RE-CAMPAIGN] Invalid Descriptions (must be 65-90 chars):`);
      descriptionValidation.filter(d => !d.valid).forEach((d, i) => {
        const reason = d.length < 65 ? 'too short' : 'too long';
        console.log(`[RE-CAMPAIGN]   ${i+1}. "${d.text}" (${d.length} chars - ${reason})`);
      });
    }
    
    // Add validation results to response
    const responseWithValidation = {
      ...generatedCopy,
      character_validation: {
        headlines_valid: headlineValidation,
        descriptions_valid: descriptionValidation
      }
    };
    console.log(`[RE-CAMPAIGN] ===============================================`);

    console.log(`[RE-CAMPAIGN] ========== GENERATION COMPLETE ==========`);
    console.log(`[RE-CAMPAIGN] Successfully generated auto-extracted real estate copy`);
    console.log(`[RE-CAMPAIGN] Final Quality Score: Headlines ${validHeadlines}/15, Descriptions ${validDescriptions}/4`);
    console.log(`[RE-CAMPAIGN] =========================================`);

    // === Step 10: Save to Database ===
    const communityName = clientProfile.property.communityName || extractedDetails.location.city;
    const derivedProductName = `${campaignName} - ${communityName}`;
    const derivedTargetAudience = extractedDetails.targetDemographic || clientProfile.demographics.primaryAudience || 'General';

    const campaignData = {
      client_id: clientId,
      campaign_type: campaignType,
      product_name: derivedProductName,
      target_audience: derivedTargetAudience,
      ad_group_type: adGroupType, // Store original value (may be null for distributed campaigns)
      location_data: extractedDetails.location,
      unit_details: extractedDetails.unitDetails || null,
      proximity_targets: extractedDetails.proximityTargets || null,
      price_range: extractedDetails.priceRange || null,
      special_offers: extractedDetails.specialOffers || null,
      target_demographic: extractedDetails.targetDemographic || null,
      generated_copy: responseWithValidation,
      character_validation: responseWithValidation.character_validation
    };

    const { data: newCampaign, error: insertError } = await supabase
      .from('campaigns')
      .insert(campaignData)
      .select()
      .single();

    if (insertError) {
      console.error('[RE-CAMPAIGN] Database insert error:', insertError);
      throw new Error(`Failed to save campaign: ${insertError.message}`);
    }

    console.log(`[RE-CAMPAIGN] Auto-extracted campaign saved with ID: ${newCampaign.id}`);

    // === Step 11: Return Success Response ===
    return NextResponse.json({ 
      success: true, 
      campaignId: newCampaign.id,
      generatedCopy: responseWithValidation,
      derivedContext: extractedDetails, // Show what was auto-extracted
      // Context metadata for debugging
      contextMetadata: {
        chunksRetrieved: uniqueChunks.length,
        clientProfileCompleteness: clientProfile.completenessScore,
        campaignContextScore: campaignContext.overallRelevanceScore,
        extractionSummary: {
          hasLocation: !!extractedDetails.location.city,
          hasPricing: !!extractedDetails.priceRange,
          hasDemographics: !!extractedDetails.targetDemographic,
          hasUnitDetails: !!extractedDetails.unitDetails,
          hasProximityTargets: !!(extractedDetails.proximityTargets?.length),
          hasSpecialOffers: !!extractedDetails.specialOffers
        }
      },
      validationSummary: {
        headlinesValid: headlineValidation.filter(h => h.valid).length,
        descriptionsValid: descriptionValidation.filter(d => d.valid).length,
        totalHeadlines: headlineValidation.length,
        totalDescriptions: descriptionValidation.length
      }
    });

  } catch (error: any) {
    console.error("Auto-extraction real estate campaign generation failed:", error);
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
} 