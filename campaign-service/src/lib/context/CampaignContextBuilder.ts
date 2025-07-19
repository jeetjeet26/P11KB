import { StructuredClientProfile } from './ClientProfileManager';

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
      keywordStrategy: this.generateKeywordStrategy(request, clientProfile),
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
      if (adGroupType === 'distributed_focus') {
        guidance.push('DISTRIBUTED HEADLINES: Create headlines across ALL proximity focuses:');
        guidance.push('• Near Landmarks (4+ headlines): Popular attractions, parks, entertainment venues');
        guidance.push('• Near Transit (4+ headlines): Bus stops, train stations, metro hubs');
        guidance.push('• Near Employers (4+ headlines): Major companies, business districts, offices');
        guidance.push('• Near Schools (3+ headlines): Universities, colleges, schools');
        guidance.push('Use proximity language: "Near", "Close to", "Minutes from", "Walking distance"');
        guidance.push('Emphasize convenience and time-saving benefits throughout');
      } else {
        switch (adGroupType) {
          case 'near_landmarks':
            guidance.push('Highlight prestige and convenience of landmark proximity');
            guidance.push('Use specific landmark names in ad copy');
            break;
          case 'near_transit':
            guidance.push('Focus on commute benefits and transportation convenience');
            guidance.push('Target commuters and car-free lifestyle advocates');
            break;
          case 'near_employers':
            guidance.push('Emphasize work-life balance and reduced commute stress');
            guidance.push('Target employees of specific companies or districts');
            break;
          case 'near_schools':
            guidance.push('Appeal to students, families, and education-focused renters');
            guidance.push('Highlight educational quality and convenience');
            break;
        }
      }
    }

    return guidance;
  }

  /**
   * Generate keyword strategy recommendations
   */
  private static generateKeywordStrategy(
    request: CampaignRequest,
    profile: StructuredClientProfile
  ): string[] {
    
    const strategy: string[] = [];

    // Base location keywords
    strategy.push(`Include exact match keywords for "${request.location.city} apartments"`);
    strategy.push(`Use phrase match for "apartments in ${request.location.city}"`);

    // Campaign-specific keyword strategies
    if (request.campaignType === 're_unit_type' && request.unitDetails?.bedrooms !== undefined) {
      const bedrooms = request.unitDetails.bedrooms;
      const bedroomText = bedrooms === 0 ? 'studio' : `${bedrooms} bedroom`;
      strategy.push(`Target exact match: "[${bedroomText} apartments ${request.location.city}]"`);
      strategy.push(`Include phrase match: "${bedroomText} apartments near me"`);
    }

    // Proximity keywords
    if (request.proximityTargets?.length) {
      request.proximityTargets.forEach(target => {
        strategy.push(`Add proximity keywords: "apartments near ${target}"`);
      });
    }

    // Amenity-based keywords
    if (profile.property.amenities.length > 0) {
      const topAmenities = profile.property.amenities.slice(0, 3);
      topAmenities.forEach(amenity => {
        strategy.push(`Consider amenity keywords: "${amenity.toLowerCase()} apartments"`);
      });
    }

    // Negative keywords
    strategy.push('Add negative keywords for: sales, buy, purchase, mortgage');
    if (profile.property.pricePoint?.toLowerCase().includes('luxury')) {
      strategy.push('Add negative keywords for: cheap, budget, low cost');
    }

    return strategy;
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
      context.keywordStrategy.forEach((strategy, index) => {
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