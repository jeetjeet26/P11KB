import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';
import { MultiQueryGenerator, MultiQueryResult } from '@/lib/context/MultiQueryGenerator';
import { ChunkClassifier, CategorizedChunks } from '@/lib/context/ChunkClassifier';
import { ClientProfileManager, ClientIntakeData, StructuredClientProfile } from '@/lib/context/ClientProfileManager';
import { CampaignContextBuilder, StructuredCampaignContext, EnhancedContextBuilder } from '@/lib/context/CampaignContextBuilder';
import { EnhancedPromptGenerator } from '@/lib/context/EnhancedPromptGenerator';
import { UnifiedCampaignContextBuilder } from '@/lib/context/UnifiedCampaignContextBuilder';

// Clients are initialized lazily inside the request handler to avoid module-load failures

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

interface CompositionDiagnostics {
  campaignType: string;
  communityMentionsInHeadlines?: number;
  communityMentionTarget?: string;
  ctaHeadlines: number;
  ctaDescriptions: number;
  ctaTargets: { headlinesMin: number; headlinesMax: number; descriptionsMin: number };
  abbreviationBalance: {
    spelledHeadlines: number;
    spelledDescriptions: number;
    abbreviatedHeadlines: number;
    abbreviatedDescriptions: number;
    spelledTargets: { headlinesMin: number; descriptionsMin: number };
  };
  unitTypeMentions?: {
    headlinesWithUnitType: number;
    totalHeadlines: number;
    mostHeadlinesThreshold: number; // informational
  };
  amenitySignalsFound: string[];
  fhRiskFlags: string[];
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

    // Extract move-in date for all campaign types (if available)
    extracted.moveInDate = this.extractMoveInDate(categorizedChunks, clientProfile);

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
    
    // Enhanced regex patterns to handle various address formats
    const patterns = [
      // Pattern 1: "Street Number Street Name Suite/Unit City, State ZipCode"
      // Example: "3585 Aero Court Suite 100 Fort Myers, FL 33916"
      /^(.+?)\s+(?:suite|unit|apt|apartment|#)\s*\w*\s+([^,]+),\s*([A-Za-z\s]+?)\s+(\d{5}(?:-\d{4})?)?\s*$/i,
      
      // Pattern 2: "Street Address City, State ZipCode" (original)
      // Example: "3585 Aero Court San Diego, CA 92123"
      /^(.+?)\s+([^,]+),\s*([A-Za-z\s]+?)\s+(\d{5}(?:-\d{4})?)?\s*$/,
      
      // Pattern 3: "City, State ZipCode" (simple format)
      // Example: "Fort Myers, FL 33916"
      /^([^,]+),\s*([A-Za-z\s]+?)\s+(\d{5}(?:-\d{4})?)?\s*$/,
      
      // Pattern 4: "Street Address in City, State"
      // Example: "3585 Aero Court in Fort Myers, FL"
      /^(.+?)\s+(?:in|at)\s+([^,]+),\s*([A-Za-z\s]+?)(?:\s+(\d{5}(?:-\d{4})?))?\s*$/i
    ];
    
    for (let i = 0; i < patterns.length; i++) {
      const match = address.match(patterns[i]);
      if (match) {
        let streetAddress, city, stateStr, zipCode;
        
        if (i === 0) {
          // Suite/Unit pattern
          [, streetAddress, city, stateStr, zipCode] = match;
        } else if (i === 1 || i === 3) {
          // Standard or "in city" pattern
          [, streetAddress, city, stateStr, zipCode] = match;
        } else if (i === 2) {
          // Simple city, state pattern
          [, city, stateStr, zipCode] = match;
        }
        
        const normalizedState = this.normalizeState(stateStr?.trim() || '');
        
        console.log(`[RE-CAMPAIGN] Parsed with pattern ${i + 1} - City: "${city?.trim() || ''}", State: "${normalizedState}", Zip: "${zipCode || 'N/A'}"`);
        
        return {
          city: city?.trim() || '',
          state: normalizedState,
          zipCode: zipCode?.trim(),
          county: undefined
        };
      }
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

  private static extractMoveInDate(categorizedChunks: CategorizedChunks, clientProfile: StructuredClientProfile): string | undefined {
    // Search chunks for move-in date and availability information
    const allChunks = [
      ...categorizedChunks.general,
      ...categorizedChunks.propertyFeatures
    ];

    for (const chunk of allChunks) {
      const content = chunk.content.toLowerCase();
      
      // Look for specific availability dates
      const datePatterns = [
        /(?:available|move-in\s+ready|lease\s+ready|ready\s+for\s+occupancy)\s+(?:in\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i,
        /(?:available|move-in\s+ready|lease\s+ready)\s+(?:in\s+)?(\d{1,2})\/(\d{4})/i,
        /(?:coming\s+soon|opening|grand\s+opening)\s+(?:in\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i
      ];

      for (const pattern of datePatterns) {
        const match = content.match(pattern);
        if (match) {
          // Clean and format the date
          let dateString = match[0].trim();
          // Capitalize first letter
          dateString = dateString.charAt(0).toUpperCase() + dateString.slice(1);
          return dateString;
        }
      }

      // Look for immediate availability
      if (content.includes('now leasing') || content.includes('immediate move-in') || content.includes('available now')) {
        return 'Available Now';
      }

      if (content.includes('pre-leasing') || content.includes('accepting applications')) {
        return 'Pre-Leasing Now';
      }
    }

    return undefined;
  }
}

// ===== PHASE 4: ENHANCED CAMPAIGN GENERATOR =====

// NOTE: MultifamilyContextBuilder has been replaced by UnifiedCampaignContextBuilder
// All logic has been consolidated into the unified builder for better maintainability

/*
 * COMPREHENSIVE LOGGING ENABLED:
 * - Multi-query vector search results and chunk classification
 * - Extracted campaign details (location, pricing, demographics, etc.)
 * - Client profile summary (brand voice, amenities, competitors, completeness score)
 * - Campaign context scores and section relevance
 * - Enhanced prompt preview (first 500 chars) sent to OpenAI Assistant
 * - Gemini response preview and JSON parsing
 * - Character validation results for Google Ads compliance
 * - Final generation quality scores
 * 
 * To enable FULL prompt/response logging, change ENABLE_FULL_*_LOGGING to true
 */
export async function POST(req: NextRequest) {
  try {
    // Phase 6.1: Hybrid Approach - Check if async is enabled and complexity warrants it
    const ENABLE_ASYNC_GENERATION = process.env.ENABLE_ASYNC_GENERATION === 'true';
    
    // Validate required environment variables early and lazily
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return NextResponse.json({
        success: false,
        error: 'Server misconfiguration: Supabase URL or anon key missing.'
      }, { status: 503 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({
        success: false,
        error: 'Server misconfiguration: OPENAI_API_KEY is not set.'
      }, { status: 503 });
    }

    // Initialize clients lazily after env validation
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

    // Phase 6.1: Hybrid Approach - Route based on complexity and async settings
    if (ENABLE_ASYNC_GENERATION) {
      const shouldUseAsync = shouldRouteToAsync(campaignType, adGroupType);
      
      if (shouldUseAsync) {
        console.log(`[RE-CAMPAIGN] Routing to async generation due to complexity: ${campaignType}${adGroupType ? ` (${adGroupType})` : ''}`);
        
        // Create async job and return job ID
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
          console.error('[RE-CAMPAIGN] Failed to create async job:', jobError);
          // Fall back to synchronous processing
          console.log('[RE-CAMPAIGN] Falling back to synchronous processing');
        } else {
          const estimatedDuration = estimateGenerationDuration(campaignType, !!adGroupType);
          
          return NextResponse.json({
            success: true,
            asyncMode: true,
            jobId: job.id,
            estimatedDuration,
            status: 'pending',
            message: 'Campaign complexity requires async processing. Job created successfully.',
            pollingEndpoint: `/api/campaigns/jobs/${job.id}`,
            realTimeChannel: 'campaign-jobs'
          });
        }
      }
    }

    console.log(`[RE-CAMPAIGN] Starting synchronous auto-extraction campaign generation for client ${clientId}`);
    // For campaigns that don't require ad group focus, use a default value for logging/processing
    const effectiveAdGroupType = adGroupType || 'distributed_focus';
    console.log(`[RE-CAMPAIGN] Campaign: ${campaignName} | Type: ${campaignType} | Ad Group: ${effectiveAdGroupType}`);

    // === Step 0: Get Client Name ===
    const { data: clientData, error: clientError } = await supabase
      .from('clients')
      .select('name')
      .eq('id', clientId)
      .single();

    if (clientError) {
      console.warn(`[RE-CAMPAIGN] Could not retrieve client name for client ID ${clientId}:`, clientError);
    }
    const clientName = clientData?.name || null;
    console.log(`[RE-CAMPAIGN] Retrieved client name: ${clientName}`);


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
    
    // Execute parallel vector searches (optimize for Heroku 30s router timeout)
    // Reduce per-query match count to speed up RPCs
    const MATCH_COUNT = Number(process.env.MATCH_COUNT || 10);
    const searchPromises = queryEmbeddings.map(embedding =>
      supabase.rpc('match_chunks', {
        client_id_filter: clientId,
        query_embedding: embedding,
        match_threshold: 0.3,
        match_count: MATCH_COUNT, // optimized default 10 per query
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
      categorizedChunks,
      clientName
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
    console.log(`[RE-CAMPAIGN] Move-In Date: ${extractedDetails.moveInDate || 'Not found'}`);
    console.log(`[RE-CAMPAIGN] Special Offers: ${extractedDetails.specialOffers || 'Not found'}`);
    console.log(`[RE-CAMPAIGN] Target Demographic: ${extractedDetails.targetDemographic || 'Not found'}`);
    console.log(`[RE-CAMPAIGN] Unit Details:`, extractedDetails.unitDetails || 'Not applicable');
    console.log(`[RE-CAMPAIGN] Proximity Targets:`, extractedDetails.proximityTargets || 'Not applicable');
    console.log(`[RE-CAMPAIGN] Additional Context: ${extractedDetails.additionalContext || 'Not found'}`);
    console.log(`[RE-CAMPAIGN] ================================================`);

    // === Step 5: Build Unified Campaign Context ===
    console.log(`[RE-CAMPAIGN] Building unified campaign context with intelligent path selection`);
    
    // Create full campaign request with extracted details
    const fullCampaignRequest = {
      clientId,
      campaignType,
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

    // Use the unified context builder for intelligent path selection
    const unifiedContextResult = await UnifiedCampaignContextBuilder.buildContext(
      clientId,
      campaignType,
      effectiveAdGroupType,
      fullCampaignRequest,
      clientProfile,
      clientProfile.property.communityName || extractedDetails.location.city
    );
    
    console.log(`[RE-CAMPAIGN] ========== UNIFIED CONTEXT SUMMARY ==========`);
    console.log(`[RE-CAMPAIGN] Path Used: ${unifiedContextResult.pathUsed.toUpperCase()}`);
    console.log(`[RE-CAMPAIGN] Has Dual Chunking: ${unifiedContextResult.hasDualChunking}`);
    console.log(`[RE-CAMPAIGN] Campaign Focus: ${unifiedContextResult.campaignFocus || 'N/A'}`);
    console.log(`[RE-CAMPAIGN] Context Summary: ${UnifiedCampaignContextBuilder.getContextSummary(unifiedContextResult)}`);
    console.log(`[RE-CAMPAIGN] ===================================================`);

    // === Step 6: Build Unified Prompt ===
    console.log(`[RE-CAMPAIGN] Building prompt using unified context builder`);
    
    const prompt = await UnifiedCampaignContextBuilder.buildPrompt(
      unifiedContextResult,
      fullCampaignRequest,
      clientProfile
    );
    
    console.log(`[RE-CAMPAIGN] ========== ENHANCED PROMPT FOR OPENAI ==========`);
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

    // === Step 7: Generate Copy with OpenAI (optionally enrich with Google Maps for proximity) ===
    const enableMapsTool = campaignType === 're_proximity';
    const openaiModel = process.env.OPENAI_GENERATION_MODEL || 'gpt-4o-mini';

    // === PHASE 4.2: UNIFIED SYSTEM IMPLEMENTATION ===
    // Legacy enhancement blocks have been REMOVED - using pure enhanced system
    // The EnhancedPromptGenerator now contains all business rules and compliance
    console.log(`[PHASE4] ✨ UNIFIED SYSTEM ACTIVE - Using sophisticated guidance with embedded business compliance`);
    
    // Use the enhanced prompt as-is, without legacy overrides
    let enhancedPrompt = prompt;
    
    // Legacy enhancement blocks have been COMPLETELY REMOVED
    // The sophisticated EnhancedPromptGenerator now handles all business rules naturally

    // Optionally enrich prompt with Google Maps insights for proximity campaigns
    let mapsInsights = '';
    if (enableMapsTool) {
      try {
        const cityState = `${extractedDetails.location.city}, ${extractedDetails.location.state}`;
        const proximityQuery = `popular places near ${cityState}`;
        console.log(`[RE-CAMPAIGN] Fetching Maps insights for: ${proximityQuery}`);
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
      } catch (e) {
        console.warn('[RE-CAMPAIGN] Maps enrichment failed (non-blocking).');
      }
    }

    console.log(`[RE-CAMPAIGN] Generating copy with OpenAI model: ${openaiModel}`);

    const generationPrompt = `${enhancedPrompt}\n\nOutput strictly as a single JSON object with keys: 
{"headlines": string[15], "descriptions": string[4], "keywords"?: string[], "final_url_paths"?: string[]}.${mapsInsights}`;

    const response = await openai.responses.create({
      model: openaiModel,
      input: generationPrompt,
      response_format: { type: 'json_object' }
    });

    const responseText = (response as any).output_text ?? '';
    if (!responseText) {
      throw new Error('OpenAI returned empty response');
    }

    // === Step 8: Extract and Parse Response ===
    console.log(`[RE-CAMPAIGN] ========== OPENAI RESPONSE ==========`);
    console.log(`[RE-CAMPAIGN] Raw OpenAI Response Length: ${responseText.length} characters`);
    console.log(`[RE-CAMPAIGN] Raw Response Preview (first 1000 chars):`);
    console.log(responseText.substring(0, 1000) + (responseText.length > 1000 ? '\n...[TRUNCATED FOR PREVIEW]...' : ''));
    console.log(`[RE-CAMPAIGN] ================================================`);
    
    // To see the FULL OpenAI response, change this to true
    const ENABLE_FULL_RESPONSE_LOGGING = false;
    if (ENABLE_FULL_RESPONSE_LOGGING) {
      console.log(`[RE-CAMPAIGN] ========== FULL OPENAI RESPONSE ==========`);
      console.log(responseText);
      console.log(`[RE-CAMPAIGN] ===============================================`);
    }
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    
    console.log(`[RE-CAMPAIGN] ========== JSON EXTRACTION & PARSING ==========`);
    if (!jsonMatch) {
        console.error('[RE-CAMPAIGN] No JSON found in response. Full response:');
        console.error(responseText);
        throw new Error("OpenAI did not return valid JSON.");
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
      
      if (!parsedResponse.headlines || !Array.isArray(parsedResponse.headlines)) {
        throw new Error("Invalid response: Missing headlines array");
      }
      if (!parsedResponse.descriptions || !Array.isArray(parsedResponse.descriptions)) {
        throw new Error("Invalid response: Missing descriptions array");
      }
      
      // Auto-trim to required lengths if we have more than needed
      if (parsedResponse.headlines.length > 15) {
        console.log(`[RE-CAMPAIGN] ⚠️ Got ${parsedResponse.headlines.length} headlines, trimming to 15`);
        parsedResponse.headlines = parsedResponse.headlines.slice(0, 15);
      } else if (parsedResponse.headlines.length < 15) {
        throw new Error(`Invalid response: Need at least 15 headlines, got ${parsedResponse.headlines.length}`);
      }
      
      if (parsedResponse.descriptions.length > 4) {
        console.log(`[RE-CAMPAIGN] ⚠️ Got ${parsedResponse.descriptions.length} descriptions, trimming to 4`);
        parsedResponse.descriptions = parsedResponse.descriptions.slice(0, 4);
      } else if (parsedResponse.descriptions.length < 4) {
        throw new Error(`Invalid response: Need at least 4 descriptions, got ${parsedResponse.descriptions.length}`);
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

    // === Step 9: Enhanced Character Validation & Auto-Correction ===
    console.log(`[RE-CAMPAIGN] ========== ENHANCED CHARACTER VALIDATION ==========`);
    
    // Use our new validation and correction system
    const validationResult = EnhancedPromptGenerator.validateAndCorrectGeneratedContent(generatedCopy);
    
    console.log(`[RE-CAMPAIGN] Validation Results:`);
    console.log(`[RE-CAMPAIGN] - Headline Errors: ${validationResult.validationResults.headlineErrors.length}`);
    console.log(`[RE-CAMPAIGN] - Description Errors: ${validationResult.validationResults.descriptionErrors.length}`);
    console.log(`[RE-CAMPAIGN] - Corrections Applied: ${validationResult.validationResults.correctionsMade}`);
    
    if (validationResult.validationResults.correctionsMade) {
      console.log(`[RE-CAMPAIGN] Applied Auto-Corrections:`);
      validationResult.validationResults.headlineErrors.forEach(error => console.log(`[RE-CAMPAIGN] - ${error}`));
      validationResult.validationResults.descriptionErrors.forEach(error => console.log(`[RE-CAMPAIGN] - ${error}`));
      
      // Update the generated copy with corrected versions
      generatedCopy = {
        ...generatedCopy,
        headlines: validationResult.headlines,
        descriptions: validationResult.descriptions,
        keywords: validationResult.keywords || generatedCopy.keywords,
        final_url_paths: validationResult.final_url_paths || generatedCopy.final_url_paths
      };
    }
    
    // Legacy validation for backward compatibility
    let headlineValidation = AdCopyValidator.validateHeadlines(generatedCopy.headlines);
    let descriptionValidation = AdCopyValidator.validateDescriptions(generatedCopy.descriptions);
    
    let validHeadlines = headlineValidation.filter(h => h.valid).length;
    let validDescriptions = descriptionValidation.filter(d => d.valid).length;
    
    console.log(`[RE-CAMPAIGN] Final Validation: ${validHeadlines}/15 headlines valid, ${validDescriptions}/4 descriptions valid`);
    
    // === Fallback: Manual Retry for Persistent Issues ===
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
- Add descriptive words to short headlines under 20 characters: "Downtown Apt" → "Luxury Downtown Apts for Rent" 
- Shorten long headlines while keeping the key message
- Count characters including ALL spaces and punctuation

Return ONLY a JSON object with the corrected headlines array:
{
  "headlines": ["Corrected headline 1", "Corrected headline 2", ...]
}

Original headlines that need fixing:
${JSON.stringify(generatedCopy.headlines, null, 2)}`;

      try {
        console.log(`[RE-CAMPAIGN] Attempting headline correction with OpenAI...`);
        const correctionResponse = await openai.responses.create({
          model: openaiModel,
          input: correctionPrompt,
          response_format: { type: 'json_object' }
        });
        const correctionText = (correctionResponse as any).output_text ?? '';
        const correctionJsonMatch = correctionText.match(/\{[\s\S]*\}/);
        if (correctionJsonMatch) {
          try {
            const correctedData = JSON.parse(correctionJsonMatch[0]);
            if (correctedData.headlines && Array.isArray(correctedData.headlines) && correctedData.headlines.length === 15) {
              console.log(`[RE-CAMPAIGN] Correction attempt successful, validating corrected headlines...`);
              generatedCopy.headlines = correctedData.headlines;
              const newHeadlineValidation = AdCopyValidator.validateHeadlines(generatedCopy.headlines);
              const newValidHeadlines = newHeadlineValidation.filter(h => h.valid).length;
              console.log(`[RE-CAMPAIGN] Post-correction validation: ${newValidHeadlines}/15 headlines valid`);
              headlineValidation = newHeadlineValidation;
              validHeadlines = newValidHeadlines;
            } else {
              console.log(`[RE-CAMPAIGN] Correction response invalid - keeping original headlines`);
            }
          } catch {
            console.log(`[RE-CAMPAIGN] Failed to parse correction JSON - keeping original headlines`);
          }
        } else {
          console.log(`[RE-CAMPAIGN] No valid JSON in correction response - keeping original headlines`);
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
    
    // Optional composition diagnostics (non-blocking)
    const ENABLE_COMPOSITION_DIAGNOSTICS = true;
    const computeDiagnostics = (): CompositionDiagnostics | null => {
      try {
        const headlines = generatedCopy.headlines || [];
        const descriptions = generatedCopy.descriptions || [];
        const textAll = (headlines.concat(descriptions)).join(' ').toLowerCase();

        // CTA list (approved)
        const ctaList = [
          'call today','schedule a tour','learn more','join the vip list','join the priority list',
          'apply now','lease today','check availability'
        ];
        const ctaRegexes = ctaList.map(c => new RegExp(c, 'i'));
        const ctaHeadlines = headlines.filter(h => ctaRegexes.some(r => r.test(h))).length;
        const ctaDescriptions = descriptions.filter(d => ctaRegexes.some(r => r.test(d))).length;

        // Abbreviation balance
        const spelledWordRegex = /(apartments|apartment|bedroom|bedrooms)/i;
        const abbreviationsRegex = /(apts\b|\b\d\s*br\b|\bbrs?\b)/i;
        const spelledHeadlines = headlines.filter(h => spelledWordRegex.test(h)).length;
        const spelledDescriptions = descriptions.filter(d => spelledWordRegex.test(d)).length;
        const abbreviatedHeadlines = headlines.filter(h => abbreviationsRegex.test(h)).length;
        const abbreviatedDescriptions = descriptions.filter(d => abbreviationsRegex.test(d)).length;

        // Community name mentions for general
        let communityMentionsInHeadlines: number | undefined = undefined;
        let communityMentionTarget: string | undefined = undefined;
        if (campaignType === 're_general_location') {
          const community = clientProfile.property.communityName || extractedDetails.location.city;
          if (community) {
            const communityRegex = new RegExp(community.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i');
            communityMentionsInHeadlines = headlines.filter(h => communityRegex.test(h)).length;
            communityMentionTarget = 'Target 3–5 mentions across headlines';
          }
        }

        // Unit type mentions for unit_type
        let unitTypeMentions: CompositionDiagnostics['unitTypeMentions'] | undefined = undefined;
        if (campaignType === 're_unit_type') {
          const unitPatterns = [
            /\bstudio\b/i,
            /\b1\s*br\b|\bone\s*bed(room)?s?\b/i,
            /\b2\s*br\b|\btwo\s*bed(room)?s?\b/i,
            /\b3\s*br\b|\bthree\s*bed(room)?s?\b/i,
            /\b4\s*br\b|\bfour\s*bed(room)?s?\b|\b4\+\s*bed(room)?s?\b/i
          ];
          const headlinesWithUnitType = headlines.filter(h => unitPatterns.some(p => p.test(h))).length;
          unitTypeMentions = {
            headlinesWithUnitType,
            totalHeadlines: headlines.length,
            mostHeadlinesThreshold: 8
          };
        }

        // Amenity signals (from feedback list)
        const amenitySignals = [
          'designer finishes','expansive co-working lounge','spacious floorplan layouts',
          'smart home technology','electric car charging','cabanas','grills','pizza oven',
          'pet friendly','dog park'
        ];
        const amenitySignalsFound = amenitySignals.filter(a => new RegExp(a, 'i').test(textAll));

        // FH risk denylist (simple)
        const fhRisk = [
          'family-friendly','for families','perfect for families','christian','jewish','muslim',
          'seniors only','no children','able-bodied','disabled','handicapped','female only','male only'
        ];
        const fhRiskFlags = fhRisk.filter(f => new RegExp(f, 'i').test(textAll));

        const diagnostics: CompositionDiagnostics = {
          campaignType,
          communityMentionsInHeadlines,
          communityMentionTarget,
          ctaHeadlines,
          ctaDescriptions,
          ctaTargets: { headlinesMin: 3, headlinesMax: 5, descriptionsMin: 1 },
          abbreviationBalance: {
            spelledHeadlines,
            spelledDescriptions,
            abbreviatedHeadlines,
            abbreviatedDescriptions,
            spelledTargets: { headlinesMin: 3, descriptionsMin: 1 }
          },
          unitTypeMentions,
          amenitySignalsFound,
          fhRiskFlags
        };

        return diagnostics;
      } catch {
        return null;
      }
    };

    const compositionDiagnostics = ENABLE_COMPOSITION_DIAGNOSTICS ? computeDiagnostics() : null;

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
    console.log(`[RE-CAMPAIGN] Note: Copy generated but NOT saved - awaiting user curation and approval`);
    console.log(`[RE-CAMPAIGN] =========================================`);

    // === Step 10: Return Generation Results with Enhanced Context Metadata ===
    // Include derived context for potential saving later
    const derivedCampaignData = {
      clientId,
      campaignType,
      campaignName,
      adGroupType,
      location: extractedDetails.location,
      unitDetails: extractedDetails.unitDetails,
      proximityTargets: extractedDetails.proximityTargets,
      priceRange: extractedDetails.priceRange,
      moveInDate: extractedDetails.moveInDate,
      specialOffers: extractedDetails.specialOffers,
      targetDemographic: extractedDetails.targetDemographic,
      additionalContext: extractedDetails.additionalContext,
      // Derived database fields for saving later
      derivedProductName: `${campaignName} - ${clientProfile.property.communityName || extractedDetails.location.city}`,
      derivedTargetAudience: extractedDetails.targetDemographic || clientProfile.demographics.primaryAudience || 'General'
    };

    // Include enhanced context metadata for Phase 4/5 UI preview
    const enhancedContextMetadata = {
      hasDualChunking: unifiedContextResult.hasDualChunking,
      campaignFocus: unifiedContextResult.campaignFocus || 'general_focus',
      pathUsed: unifiedContextResult.pathUsed,
      atomicIngredients: unifiedContextResult.hasDualChunking && unifiedContextResult.pathUsed === 'enhanced' ? {
        available: Object.entries((unifiedContextResult.context as any).atomicIngredients).map(([category, items]) => ({
          category,
          count: (items as string[]).length,
          examples: (items as string[]).slice(0, 3)
        })),
        totalCount: Object.values((unifiedContextResult.context as any).atomicIngredients).flat().length
      } : null,
      narrativeContext: unifiedContextResult.hasDualChunking && unifiedContextResult.pathUsed === 'enhanced' ? {
        available: (unifiedContextResult.context as any).narrativeContext.length,
        examples: (unifiedContextResult.context as any).narrativeContext.slice(0, 2).map((chunk: string) => 
          chunk.length > 100 ? chunk.substring(0, 100) + '...' : chunk
        )
      } : null,
      focusMapping: (() => {
        const campaignFocus = unifiedContextResult.campaignFocus || 'general_focus';
        return UnifiedCampaignContextBuilder.getCampaignFocusMapping()[campaignFocus as keyof ReturnType<typeof UnifiedCampaignContextBuilder.getCampaignFocusMapping>] || 
               UnifiedCampaignContextBuilder.getCampaignFocusMapping().general_focus;
      })()
    };

    return NextResponse.json({ 
      success: true, 
      generatedCopy: responseWithValidation,
      diagnostics: compositionDiagnostics || undefined,
      campaignData: derivedCampaignData, // For saving later
      derivedContext: extractedDetails, // Show what was auto-extracted
      // Enhanced context metadata for Phase 5 UI
      enhancedContext: enhancedContextMetadata,
      // Context metadata for debugging
      contextMetadata: {
        chunksRetrieved: uniqueChunks.length,
        clientProfileCompleteness: clientProfile.completenessScore,
        campaignContextScore: unifiedContextResult.pathUsed === 'standard' 
          ? (unifiedContextResult.context as StructuredCampaignContext).overallRelevanceScore 
          : 95, // Enhanced path doesn't have a score, use high default
        extractionSummary: {
          hasLocation: !!extractedDetails.location.city,
          hasPricing: !!extractedDetails.priceRange,
          hasMoveInDate: !!extractedDetails.moveInDate,
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

/**
 * Phase 6.1: Determine if request should route to async processing
 * Based on campaign complexity and proximity search requirements
 */
function shouldRouteToAsync(campaignType: string, adGroupType?: string): boolean {
  // Always route proximity campaigns to async due to Google Maps integration
  if (campaignType === 're_proximity') {
    return true;
  }
  
  // Route complex unit type campaigns to async
  if (campaignType === 're_unit_type' && adGroupType) {
    return true;
  }
  
  // Keep simple general location campaigns synchronous for speed
  return false;
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