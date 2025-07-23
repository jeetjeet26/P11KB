import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { createClient } from '@/lib/supabase/server';
import { MultiQueryGenerator, MultiQueryResult } from '@/lib/context/MultiQueryGenerator';
import { ChunkClassifier, CategorizedChunks } from '@/lib/context/ChunkClassifier';
import { ClientProfileManager, ClientIntakeData, StructuredClientProfile } from '@/lib/context/ClientProfileManager';
import { CampaignContextBuilder, StructuredCampaignContext, EnhancedContextBuilder } from '@/lib/context/CampaignContextBuilder';
import { EnhancedPromptGenerator } from '@/lib/context/EnhancedPromptGenerator';

// Initialize OpenAI client (ONLY for embeddings)
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

// Initialize Gemini client (for generation with Google Maps tool)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

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
  keywords: {
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

/**
 * Enhanced Campaign Generator with dual chunking support and campaign focus mapping
 */
class MultifamilyContextBuilder {
  
  /**
   * Generate ad copy using organized dual chunking context and campaign focus
   */
  static async generateAdCopy(
    clientId: string,
    communityName: string, 
    campaignType: string,
    adGroupType: string,
    request: any
  ): Promise<{context: any, prompt: string, hasDualChunking: boolean}> {
    
    console.log(`[ENHANCED_CAMPAIGN] Generating ad copy with enhanced context builder`);
    console.log(`[ENHANCED_CAMPAIGN] Community: ${communityName}, Campaign Type: ${campaignType}, Ad Group: ${adGroupType}`);
    
    // Determine campaign focus based on campaign type and ad group
    const campaignFocus = this.determineCampaignFocus(campaignType, adGroupType);
    console.log(`[ENHANCED_CAMPAIGN] Determined campaign focus: ${campaignFocus}`);
    
    // Check if dual chunking data is available
    const supabase = createClient();
    const { data: dualChunkingData, error: chunkError } = await supabase
      .from('chunks')
      .select('chunk_type, chunk_subtype, atomic_category')
      .eq('client_id', clientId)
      .or('chunk_subtype.like.atomic_%,chunk_subtype.like.narrative_%')
      .limit(10);
    
    const hasDualChunking = !chunkError && dualChunkingData && dualChunkingData.length > 0;
    console.log(`[ENHANCED_CAMPAIGN] Dual chunking availability: ${hasDualChunking ? 'Available' : 'Not available'}`);
    
    if (hasDualChunking) {
      console.log(`[ENHANCED_CAMPAIGN] Found ${dualChunkingData.length} dual chunking records`);
      console.log(`[ENHANCED_CAMPAIGN] Chunk types:`, dualChunkingData.map(c => c.chunk_subtype).slice(0, 5));
    }
    
    // Build organized Gemini context using enhanced context builder
    let organizedContext = null;
    if (hasDualChunking) {
      try {
        organizedContext = await EnhancedContextBuilder.buildGeminiContext(
          communityName,
          campaignFocus,
          clientId
        );
        console.log(`[ENHANCED_CAMPAIGN] Built organized context with ${Object.values(organizedContext.atomicIngredients).flat().length} atomic ingredients`);
      } catch (contextError) {
        console.warn(`[ENHANCED_CAMPAIGN] Failed to build organized context:`, contextError);
        organizedContext = null;
      }
    }
    
    return {
      context: organizedContext,
      prompt: '', // Will be built by the enhanced prompt generator
      hasDualChunking: hasDualChunking && organizedContext !== null
    };
  }
  
  /**
   * Campaign focus mapping for targeted context retrieval
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
   */
  static getCampaignFocusMapping() {
    return {
      'luxury_amenities': {
        atomic_categories: ['amenity', 'lifestyle'], // General campaigns get both amenity & community content
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
        atomic_categories: ['amenity', 'lifestyle'], // Use actual existing categories
        narrative_types: ['narrative_amenities', 'narrative_location', 'narrative_lifestyle', 'narrative_community'],
        priority: 'general'
      }
    };
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
      moveInDate: extractedDetails.moveInDate,
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

    // === Step 6: Enhanced Prompt Engineering with Dual Chunking (Phase 4) ===
    console.log(`[RE-CAMPAIGN] Generating enhanced prompt using Phase 4 enhanced context builder`);
    
    // Use the new enhanced campaign generator
    const enhancedCampaignResult = await MultifamilyContextBuilder.generateAdCopy(
      clientId,
      clientProfile.property.communityName || extractedDetails.location.city,
      campaignType,
      effectiveAdGroupType,
      fullCampaignRequest
    );
    
    console.log(`[RE-CAMPAIGN] Enhanced campaign context: ${enhancedCampaignResult.hasDualChunking ? 'Using dual chunking' : 'Using fallback enhanced'}`);
    
    let prompt: string;
    if (enhancedCampaignResult.hasDualChunking && enhancedCampaignResult.context) {
      // Use enhanced dual chunking prompt (Phase 4)
      console.log(`[RE-CAMPAIGN] Building dual chunking enhanced prompt with organized context`);
      
      // Build enhanced prompt with organized atomic + narrative context
      const enhancedPrompt = EnhancedContextBuilder.buildEnhancedPrompt(
        enhancedCampaignResult.context,
        {
          adType: 'Google Ads campaign',
          campaignType: campaignType,
          adGroupType: effectiveAdGroupType,
          location: extractedDetails.location,
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
      
      // Add campaign-specific context from existing system
      const campaignSpecificContext = `
=== CAMPAIGN-SPECIFIC CONTEXT ===
${CampaignContextBuilder.generateFormattedContext(campaignContext)}

=== EXTRACTED CAMPAIGN DETAILS ===
Location: ${extractedDetails.location.city}, ${extractedDetails.location.state}
Price Range: ${extractedDetails.priceRange || 'Not specified'}
Move-In Date: ${extractedDetails.moveInDate || 'Not specified'}
${extractedDetails.specialOffers ? `Special Offers: ${extractedDetails.specialOffers}` : ''}

=== CAMPAIGN FOCUS MAPPING ===
Focus: ${enhancedCampaignResult.context.campaignFocus}
Available Atomic Ingredients: ${Object.entries(enhancedCampaignResult.context.atomicIngredients).map(([key, items]) => `${key}: ${(items as string[]).length}`).join(', ')}
Available Narrative Chunks: ${enhancedCampaignResult.context.narrativeContext.length}

🎯 DUAL CHUNKING INSTRUCTIONS:
Use atomic ingredients as precise building blocks and narrative chunks for broader context and storytelling.
Campaign focus "${enhancedCampaignResult.context.campaignFocus}" should guide which ingredients to prioritize.
       `;
       
       prompt = enhancedPrompt + '\n\n' + campaignSpecificContext;
       
     } else {
       // Fallback to enhanced prompt with existing context
       console.log(`[RE-CAMPAIGN] Using enhanced prompt with traditional context`);
       prompt = await EnhancedPromptGenerator.generateDualChunkingPrompt(
         fullCampaignRequest,
         campaignContext,
         clientProfile
       );
     }
    
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

    // === Step 7: Generate Copy with Gemini + Google Maps Tool ===
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY environment variable is not set");
    }
    
    // Initialize Gemini model with Google Maps tool for proximity campaigns
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-pro-latest",
      tools: [
        {
          functionDeclarations: [
            {
              name: "google_maps_places_query",
              description: "Find places of interest like schools, businesses, parks, or shopping centers near a specific address for real estate proximity campaigns.",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  query: {
                    type: SchemaType.STRING,
                    description: "The search query, e.g., 'top-rated schools near 3585 Aero Court, San Diego, CA' or 'major employers near San Diego, CA 92123'"
                  }
                },
                required: ["query"]
              }
            }
          ]
        }
      ]
    });

    // Enhanced prompts for different campaign types
    let enhancedPrompt = prompt;
    
    // === GENERAL LOCATION CAMPAIGN ENHANCEMENT ===
    if (campaignType === 're_general_location') {
      const communityName = clientProfile.property.communityName || extractedDetails.location.city;
      
      enhancedPrompt = `${prompt}

🎯 **ADVERTISING COPY & KEYWORD GENERATION INSTRUCTIONS** 
This is a general location campaign emphasizing balanced community branding with a strong amenity focus. Follow all requirements precisely.

**REQUIREMENT 1: GOOGLE ADS COPY**
Generate 15 headlines and 4 descriptions for a Google Ads campaign.
- **Headlines**: MUST be between 20 and 30 characters.
- **Descriptions**: MUST be between 65 and 90 characters.
- **Community Name**: The community name, "${communityName}", MUST appear in 3-5 headlines for brand recognition.
- **Amenity Focus**: Most headlines should feature amenities like "Resort-Style Pool" or "Quartz Countertops".

**REQUIREMENT 2: GOOGLE ADS KEYWORDS**
Generate a comprehensive keyword list for this campaign.
- **Broad Match Keywords**: MUST generate a list of 50-100 broad match keywords. Focus on terms related to amenities, location, apartment types (e.g., "luxury apartments ${extractedDetails.location.city}", "apartments near downtown", "new apartments with pools").
- **Negative Keywords**: MUST generate a list of at least 15 negative keywords to exclude irrelevant searches (e.g., "jobs", "reviews", "cheap", "for sale").

**REQUIREMENT 3: JSON OUTPUT**
Return ONLY a single valid JSON object. Do not include any text outside of the JSON. The JSON object must contain "headlines" (an array of 15 strings), "descriptions" (an array of 4 strings), "keywords" (an object with "broad_match" which is an array of 50-100 strings, and "negative_keywords" which is an array of at least 15 strings), and "final_url_paths" (an array of 2 URL path strings, like ["/floor-plans", "/amenities"]).

Generate compelling, community-branded, amenity-focused ad copy and keywords that establish a strong brand presence.`;
    }
    
    // === UNIT TYPE CAMPAIGN ENHANCEMENT ===
    else if (campaignType === 're_unit_type') {
      const unitTypeMapping: { [key: string]: string } = {
        'studio': 'Studio',
        '1br': '1-Bedroom',
        '2br': '2-Bedroom',
        '3br': '3-Bedroom',
        '4br_plus': '4+ Bedroom'
      };
      
      const communityName = clientProfile.property.communityName || extractedDetails.location.city;
      const unitDescription = adGroupType ? unitTypeMapping[adGroupType] : 'Apartment';

      enhancedPrompt = `${prompt}
      
🎯 **UNIT TYPE CAMPAIGN ENHANCEMENT INSTRUCTIONS:**
This is a hyper-focused campaign on advertising **${unitDescription} apartments**. The primary goal is to attract renters searching specifically for this unit configuration.

**REQUIREMENT 1: GOOGLE ADS COPY**
Generate 15 headlines and 4 descriptions that are laser-focused on the **${unitDescription} units**.
- **Headlines**: MUST be between 20 and 30 characters.
- **Descriptions**: MUST be between 65 and 90 characters.
- **Unit Focus**: ALL headlines MUST explicitly mention "${unitDescription}" or a close variation (e.g., "Two Bedroom"). Examples: "Spacious ${unitDescription} Apartments", "Your New ${unitDescription} Home Awaits", "Tour Our ${unitDescription} Units Today".
- **Community Name**: The community name, "${communityName}", SHOULD appear in at least 2-3 headlines for brand association.
- **Benefits, Not Just Features**: Highlight benefits of that unit size. For ${unitDescription}, this could be "Perfect for Your Lifestyle" or "Room to Grow". For smaller units, it could be "Affordable City Living".

**REQUIREMENT 2: GOOGLE ADS KEYWORDS**
Generate a keyword list highly specific to the unit type to maximize relevance and conversion.
- **Broad Match Keywords**: MUST generate a list of 50-75 broad match keywords centered around the unit type. Examples: "${unitDescription} apartments in ${extractedDetails.location.city}", "luxury ${unitDescription} rentals", "newly renovated two bedroom apartments".
- **Negative Keywords**: MUST generate a list of at least 20 negative keywords to exclude irrelevant searches. CRITICAL: This MUST include other unit types (e.g., if this is a 2br campaign, negative keywords must include "studio", "one bedroom", "3 bedroom", etc.). Also include standard negatives like "jobs", "cheap", "for sale".

**REQUIREMENT 3: JSON OUTPUT**
Return ONLY a single valid JSON object. Do not include any text outside of the JSON. The JSON object must contain "headlines" (an array of 15 strings), "descriptions" (an array of 4 strings), "keywords" (an object with "broad_match" and "negative_keywords" arrays), and "final_url_paths" (an array of 2 URL path strings, like ["/floor-plans/${adGroupType || '2br'}", "/gallery"]).

Generate compelling, unit-focused ad copy and a precise keyword list that will capture high-intent renters.`;
    }
    
    // === PROXIMITY CAMPAIGN ENHANCEMENT ===
    else if (campaignType === 're_proximity' && extractedDetails.location.city && extractedDetails.location.state) {
      const clientAddress = clientIntake?.community_address || `${extractedDetails.location.city}, ${extractedDetails.location.state}`;
      
      const vectorProximityData = extractedDetails.proximityTargets && extractedDetails.proximityTargets.length > 0 
        ? `\n\nVECTOR DATABASE PROXIMITY DATA:\n${extractedDetails.proximityTargets.map(target => `- ${target}`).join('\n')}`
        : '';
      
      enhancedPrompt = `${prompt}

🎯 PROXIMITY CAMPAIGN ENHANCEMENT INSTRUCTIONS:
This is a proximity campaign focusing purely on location benefits and convenience. Follow these steps:

1. **GATHER CATEGORIZED GOOGLE MAPS DATA**: Use the google_maps_places_query tool to find current, real places near "${clientAddress}":
   - SCHOOLS: Search "top rated schools near ${clientAddress}" 
   - EMPLOYERS: Search "major employers near ${clientAddress}" AND "business districts near ${clientAddress}"
   - RECREATION: Search "parks and recreation near ${clientAddress}"
   - SHOPPING: Search "shopping centers near ${clientAddress}"

2. **CATEGORIZE AND PRIORITIZE**: From each Google Maps search, pick the TOP 1-2 most recognizable/prestigious results:
   - Schools: Focus on highly rated schools, universities, or well-known institutions
   - Employers: Prioritize Fortune 500 companies, major healthcare systems, government offices
   - Recreation: Choose popular parks, entertainment venues, or sports facilities
   - Shopping: Select major malls, popular shopping districts, or lifestyle centers

3. **CREATE PURE PROXIMITY HEADLINES**: Use actual place names from Google Maps with NO community branding:
   - "Near [Actual School Name]" (not "Near Top Schools")
   - "Close to [Company Name]" (not "Close to Major Employers")
   - "Minutes from [Park/Mall Name]" (not "Minutes from Entertainment")
   - "Walking to [Transit Hub]" (focus on accessibility)

4. **COMBINE DATA SOURCES**: Supplement Google Maps data with vector database proximity information:${vectorProximityData}

5. **HEADLINE DISTRIBUTION FOR PROXIMITY** (NO community name references):
   - 4+ Employer proximity headlines using real company names
   - 3+ School proximity headlines using real school names  
   - 3+ Recreation/Shopping headlines using real venue names
   - 3+ Transit/Transportation headlines emphasizing accessibility
   - 2+ General location headlines: "Downtown ${extractedDetails.location.city} Living"

6. **PURE PROXIMITY FOCUS**: 
   - NO community name in any headlines
   - Focus entirely on convenience and location benefits
   - Emphasize time savings and accessibility advantages

7. **LOCATION CONTEXT**: The property is located at: ${clientAddress}

8. **CHARACTER COMPLIANCE**: All headlines 20-30 characters, all descriptions 65-90 characters

Generate compelling proximity-focused ad copy using pure location benefits without community branding.`;
    }

    // Function to call Google Maps Places API
    const callGoogleMapsAPI = async (query: string): Promise<string> => {
      try {
        const encodedQuery = encodeURIComponent(query);
        const mapsResponse = await fetch(
          `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodedQuery}&key=AIzaSyA-3GBIE0jdAEUoDmQZP7CHuKurGD-M0ns`
        );
        
        const mapsData = await mapsResponse.json();
        
        if (mapsData.status !== 'OK') {
          console.warn(`[RE-CAMPAIGN] Google Maps API warning: ${mapsData.status}`);
          return `No results found for "${query}"`;
        }
        
        // Extract top 5 places with names and ratings
        const places = mapsData.results.slice(0, 5).map((place: any) => {
          const rating = place.rating ? ` (${place.rating}★)` : '';
          return `${place.name}${rating}`;
        });
        
        return places.length > 0 
          ? `Found near "${query}": ${places.join(', ')}`
          : `No results found for "${query}"`;
      } catch (error) {
        console.error(`[RE-CAMPAIGN] Google Maps API error:`, error);
        return `Error searching for "${query}"`;
      }
    };

    console.log(`[RE-CAMPAIGN] Generating copy with Gemini model...`);
    
    let responseText: string = '';
    
    try {
      
      // Start conversation with Gemini
      const chat = model.startChat();
      let result = await chat.sendMessage(enhancedPrompt);
      
      // Handle function calls iteratively
      let maxIterations = 10; // Prevent infinite loops
      let iteration = 0;
      
      while (iteration < maxIterations) {
        const response = result.response;
        const candidates = response.candidates;
        
        if (!candidates || candidates.length === 0) {
          throw new Error("Gemini response has no candidates");
        }
        
        const firstCandidate = candidates[0];
        if (!firstCandidate.content || !firstCandidate.content.parts) {
          throw new Error("Gemini response has no content parts");
        }
        
        let hasFunctionCalls = false;
        const functionResponses = [];
        
        // Process all parts in the response
        for (const part of firstCandidate.content.parts) {
          if (part.functionCall) {
            hasFunctionCalls = true;
            const { name, args } = part.functionCall;
            
                         if (name === 'google_maps_places_query') {
               const query = (args as { query: string }).query;
               console.log(`[RE-CAMPAIGN] Calling Google Maps API: ${query}`);
               const mapsResult = await callGoogleMapsAPI(query);
              functionResponses.push({
                functionResponse: {
                  name: name,
                  response: { result: mapsResult }
                }
              });
            }
          } else if (part.text) {
            // If we have text and no function calls, we're done
            if (!hasFunctionCalls) {
              responseText = part.text;
              console.log(`[RE-CAMPAIGN] Gemini generation completed successfully`);
              break;
            }
          }
        }
        
        // If we found function calls, send responses back to Gemini
        if (hasFunctionCalls && functionResponses.length > 0) {
          console.log(`[RE-CAMPAIGN] Sending ${functionResponses.length} function response(s) back to Gemini...`);
          result = await chat.sendMessage(functionResponses);
          iteration++;
        } else if (responseText) {
          // We got the final text response
          break;
        } else {
          throw new Error("Gemini returned neither function calls nor text");
        }
      }
      
      if (iteration >= maxIterations) {
        throw new Error("Too many function call iterations - possible infinite loop");
      }
      
      if (!responseText || responseText.trim().length === 0) {
        throw new Error("Gemini returned empty text response after function calls");
      }
      
    } catch (geminiError) {
      console.error(`[RE-CAMPAIGN] Gemini generation failed:`, geminiError);
      throw new Error(`Gemini failed to generate copy: ${geminiError}`);
    }

    // === Step 8: Extract and Parse Response ===
    console.log(`[RE-CAMPAIGN] ========== GEMINI RESPONSE ==========`);
    console.log(`[RE-CAMPAIGN] Raw Gemini Response Length: ${responseText.length} characters`);
    console.log(`[RE-CAMPAIGN] Raw Response Preview (first 1000 chars):`);
    console.log(responseText.substring(0, 1000) + (responseText.length > 1000 ? '\n...[TRUNCATED FOR PREVIEW]...' : ''));
    console.log(`[RE-CAMPAIGN] ================================================`);
    
    // To see the FULL Gemini response, change this to true
    const ENABLE_FULL_RESPONSE_LOGGING = false;
    if (ENABLE_FULL_RESPONSE_LOGGING) {
      console.log(`[RE-CAMPAIGN] ========== FULL GEMINI RESPONSE ==========`);
      console.log(responseText);
      console.log(`[RE-CAMPAIGN] ===============================================`);
    }
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    
    console.log(`[RE-CAMPAIGN] ========== JSON EXTRACTION & PARSING ==========`);
    if (!jsonMatch) {
        console.error('[RE-CAMPAIGN] No JSON found in response. Full response:');
        console.error(responseText);
        throw new Error("Gemini did not return valid JSON.");
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
        // Use Gemini for correction instead of OpenAI threads
        console.log(`[RE-CAMPAIGN] Attempting headline correction with Gemini...`);
        
        const correctionResult = await model.generateContent(correctionPrompt);
        const correctionResponse = correctionResult.response;
        
        if (correctionResponse) {
          // Handle Gemini response properly for correction
          const candidates = correctionResponse.candidates;
          if (!candidates || candidates.length === 0) {
            throw new Error("Gemini correction response has no candidates");
          }
          
          const firstCandidate = candidates[0];
          if (!firstCandidate.content || !firstCandidate.content.parts) {
            throw new Error("Gemini correction response has no content parts");
          }
          
          // Extract text from all parts
          let textParts = [];
          for (const part of firstCandidate.content.parts) {
            if (part.text) {
              textParts.push(part.text);
            }
          }
          
          const correctionText = textParts.join('\n');
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
        } else {
          console.log(`[RE-CAMPAIGN] No correction response from Gemini - keeping original headlines`);
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
      hasDualChunking: enhancedCampaignResult.hasDualChunking,
      campaignFocus: enhancedCampaignResult.context?.campaignFocus || 'general_focus',
      atomicIngredients: enhancedCampaignResult.context ? {
        available: Object.entries(enhancedCampaignResult.context.atomicIngredients).map(([category, items]) => ({
          category,
          count: (items as string[]).length,
          examples: (items as string[]).slice(0, 3)
        })),
        totalCount: Object.values(enhancedCampaignResult.context.atomicIngredients).flat().length
      } : null,
      narrativeContext: enhancedCampaignResult.context ? {
        available: enhancedCampaignResult.context.narrativeContext.length,
        examples: enhancedCampaignResult.context.narrativeContext.slice(0, 2).map((chunk: string) => 
          chunk.length > 100 ? chunk.substring(0, 100) + '...' : chunk
        )
      } : null,
      focusMapping: (() => {
        const campaignFocus = enhancedCampaignResult.context?.campaignFocus || 'general_focus';
        const CAMPAIGN_FOCUS_MAPPING = {
          'luxury_amenities': {
            atomic_categories: ['amenity', 'lifestyle'],
            narrative_types: ['narrative_amenities', 'narrative_lifestyle', 'narrative_community'],
            priority: 'community'
          },
          'location_benefits': {
            atomic_categories: [], // Google Maps focused
            narrative_types: ['narrative_location'],
            priority: 'location'
          },
          'value_pricing': {
            atomic_categories: ['pricing', 'feature'],
            narrative_types: ['narrative_community'],
            priority: 'value'
          },
          'general_focus': {
            atomic_categories: ['amenity', 'lifestyle'],
            narrative_types: ['narrative_amenities', 'narrative_location', 'narrative_lifestyle', 'narrative_community'],
            priority: 'general'
          }
        };
        return CAMPAIGN_FOCUS_MAPPING[campaignFocus as keyof typeof CAMPAIGN_FOCUS_MAPPING] || CAMPAIGN_FOCUS_MAPPING.general_focus;
      })()
    };

    return NextResponse.json({ 
      success: true, 
      generatedCopy: responseWithValidation,
      campaignData: derivedCampaignData, // For saving later
      derivedContext: extractedDetails, // Show what was auto-extracted
      // Enhanced context metadata for Phase 5 UI
      enhancedContext: enhancedContextMetadata,
      // Context metadata for debugging
      contextMetadata: {
        chunksRetrieved: uniqueChunks.length,
        clientProfileCompleteness: clientProfile.completenessScore,
        campaignContextScore: campaignContext.overallRelevanceScore,
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