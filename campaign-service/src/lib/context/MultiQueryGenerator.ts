interface RealEstateCampaignRequest {
  clientId: string;
  campaignType: string;
  adGroupType?: string; // Optional for campaigns with distributed focuses
  
  // Property Details
  propertyId?: string;
  location?: {
    city: string;
    state: string;
    zipCode?: string;
    county?: string;
  };
  
  // Unit Details (for unit_type campaigns)
  unitDetails?: {
    bedrooms?: number;
    bathrooms?: number;
    sqft?: string;
    unitType?: string;
  };
  
  // Proximity Details (for proximity campaigns)
  proximityTargets?: string[];
  
  // Campaign Context
  priceRange?: string;
  specialOffers?: string;
  targetDemographic?: string;
  additionalContext?: string;
}

export interface MultiQueryResult {
  brandVoiceQuery: string;
  demographicQuery: string;
  propertyFeaturesQuery: string;
  localAreaQuery: string;
}

export class MultiQueryGenerator {
  /**
   * Generate 4 specialized search queries for comprehensive context retrieval
   * Replaces the single buildSearchQuery() function with targeted queries
   * Now supports auto-extraction mode where location isn't available yet
   */
  static generateMultipleQueries(request: RealEstateCampaignRequest): MultiQueryResult {
    // Handle auto-extraction mode where location might not be available
    const baseLocation = request.location?.city && request.location?.state && 
                        request.location.city !== 'Auto-Extract' && request.location.state !== 'Auto-Extract'
                        ? `${request.location.city} ${request.location.state}`
                        : 'real estate property location';
    
    return {
      brandVoiceQuery: this.generateBrandVoiceQuery(request, baseLocation),
      demographicQuery: this.generateDemographicQuery(request, baseLocation),
      propertyFeaturesQuery: this.generatePropertyFeaturesQuery(request, baseLocation),
      localAreaQuery: this.generateLocalAreaQuery(request, baseLocation)
    };
  }

  /**
   * Query for brand voice guidelines, messaging tone, and communication style
   */
  private static generateBrandVoiceQuery(request: RealEstateCampaignRequest, baseLocation: string): string {
    let query = `brand voice messaging guidelines tone communication style marketing copy`;
    
    // Add campaign-specific brand context
    switch (request.campaignType) {
      case 're_general_location':
        query += ` location-based advertising neighborhood branding`;
        break;
      case 're_unit_type':
        query += ` unit features marketing bedroom bathroom descriptions`;
        break;
      case 're_proximity':
        query += ` proximity marketing location benefits messaging`;
        break;
    }
    
    // Add target demographic influence on brand voice
    if (request.targetDemographic) {
      query += ` ${request.targetDemographic} communication preferences`;
    }
    
    return query + ` advertising guidelines brand personality voice tone`;
  }

  /**
   * Query for target demographic information, psychographics, and audience insights
   */
  private static generateDemographicQuery(request: RealEstateCampaignRequest, baseLocation: string): string {
    let query = `target audience demographics psychographics lifestyle`;
    
    // Add base location context if available (not in auto-extract mode)
    if (baseLocation !== 'real estate property location') {
      query += ` ${baseLocation} residents`;
    } else {
      query += ` real estate market demographics`;
    }
    
    // Campaign-specific demographic focus
    switch (request.campaignType) {
      case 're_general_location':
        query += ` neighborhood demographics area residents community profile`;
        break;
      case 're_unit_type':
        // Add unit-specific demographics based on ad group (if specified)
        if (request.adGroupType === 'studio') {
          query += ` young professionals students singles urban lifestyle`;
        } else if (request.adGroupType === '1br') {
          query += ` young couples professionals work from home`;
        } else if (request.adGroupType === '2br' || request.adGroupType === '3br' || request.adGroupType === '4br_plus') {
          query += ` families children roommates space requirements`;
        } else if (!request.adGroupType) {
          // For unit type campaigns without specific ad group, include all demographics
          query += ` young professionals students families couples roommates all residents`;
        }
        break;
      case 're_proximity':
        query += ` commuters transportation preferences accessibility needs`;
        break;
    }
    
    // Add explicit demographic targeting if provided
    if (request.targetDemographic) {
      query += ` ${request.targetDemographic}`;
    }
    
    return query + ` motivations pain points preferences housing needs`;
  }

  /**
   * Query for property amenities, features, and unique selling points
   */
  private static generatePropertyFeaturesQuery(request: RealEstateCampaignRequest, baseLocation: string): string {
    // Start with base query - handle auto-extraction mode
    let query = baseLocation !== 'real estate property location' 
      ? `${baseLocation} amenities features property highlights unique selling points`
      : `property amenities features highlights unique selling points`;
    
    // Add unit-specific features
    if (request.unitDetails) {
      const { bedrooms, bathrooms, sqft, unitType } = request.unitDetails;
      
      if (bedrooms !== undefined) query += ` ${bedrooms} bedroom`;
      if (bathrooms !== undefined) query += ` ${bathrooms} bathroom`;
      if (sqft) query += ` ${sqft} square feet`;
      if (unitType) query += ` ${unitType}`;
    }
    
    // Add campaign-specific features
    switch (request.campaignType) {
      case 're_unit_type':
        query += ` unit specifications floor plans layout features`;
        break;
      case 're_proximity':
        query += ` location benefits accessibility transportation`;
        break;
      case 're_general_location':
        query += ` community amenities neighborhood features`;
        break;
    }
    
    // Add proximity-based features
    if (request.proximityTargets?.length) {
      query += ` near ${request.proximityTargets.join(' ')} proximity benefits`;
    }
    
    // Add special offers and pricing context
    if (request.specialOffers) {
      query += ` ${request.specialOffers} promotions incentives`;
    }
    
    if (request.priceRange) {
      query += ` ${request.priceRange} pricing value`;
    }
    
    return query + ` apartment features amenities community benefits property advantages`;
  }

  /**
   * Query for local area insights, neighborhood benefits, and location advantages
   */
  private static generateLocalAreaQuery(request: RealEstateCampaignRequest, baseLocation: string): string {
    // Start with base query - handle auto-extraction mode
    let query = baseLocation !== 'real estate property location'
      ? `${baseLocation} neighborhood local area benefits location advantages`
      : `neighborhood local area benefits location advantages city area`;
    
    // Add ZIP code for more specific local insights
    if (request.location?.zipCode) {
      query += ` ${request.location.zipCode}`;
    }
    
    // Add county for broader area context
    if (request.location?.county) {
      query += ` ${request.location.county} county`;
    }
    
    // Add proximity targets as local area context
    if (request.proximityTargets?.length) {
      query += ` ${request.proximityTargets.join(' ')} nearby attractions`;
    }
    
    // Add campaign-specific local context
    switch (request.campaignType) {
      case 're_proximity':
        query += ` transportation access nearby employers schools landmarks`;
        break;
      case 're_general_location':
        query += ` neighborhood highlights area attractions community features`;
        break;
      case 're_unit_type':
        query += ` residential area family-friendly community amenities`;
        break;
    }
    
    return query + ` local attractions transportation dining entertainment lifestyle downtown area`;
  }

  /**
   * Get all queries as an array for easy iteration
   */
  static getQueryArray(queries: MultiQueryResult): string[] {
    return [
      queries.brandVoiceQuery,
      queries.demographicQuery,
      queries.propertyFeaturesQuery,
      queries.localAreaQuery
    ];
  }

  /**
   * Get query labels for tracking and debugging
   */
  static getQueryLabels(): string[] {
    return [
      'Brand Voice & Messaging',
      'Target Demographics & Psychographics', 
      'Property Features & Amenities',
      'Local Area & Lifestyle'
    ];
  }
} 