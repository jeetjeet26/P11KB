import { CategorizedChunks, ClassifiedChunk } from './ChunkClassifier';

export interface ClientIntakeData {
  client_id: string;
  community_name?: string;
  community_type?: string;
  community_address?: string;
  target_audience?: string;
  price_point?: string;
  unique_features?: string;
  brand_voice_guidelines?: string;
  competitor_info?: string;
  location_advantages?: string;
  amenities_highlights?: string;
  special_promotions?: string;
  intake_completed: boolean;
}

export interface BrandVoiceProfile {
  tone: string[];
  personality: string[];
  communicationStyle: string[];
  keyMessages: string[];
  avoidWords: string[];
  brandValues: string[];
  voiceGuidelines: string;
}

export interface DemographicProfile {
  primaryAudience: string;
  ageRange: string[];
  incomeLevel: string[];
  lifestyle: string[];
  interests: string[];
  painPoints: string[];
  motivations: string[];
  communicationPreferences: string[];
}

export interface PropertyProfile {
  communityName: string;
  propertyType: string;
  uniqueFeatures: string[];
  amenities: string[];
  locationAdvantages: string[];
  pricePoint: string;
  specialOffers: string[];
  competitiveDifferentiators: string[];
}

export interface CompetitorProfile {
  competitors: string[];
  competitiveAdvantages: string[];
  differentiationPoints: string[];
  marketPosition: string;
  pricingAdvantages: string[];
  uniqueSellingPoints: string[];
}

export interface StructuredClientProfile {
  clientId: string;
  brandVoice: BrandVoiceProfile;
  demographics: DemographicProfile;
  property: PropertyProfile;
  competitor: CompetitorProfile;
  hasIntakeData: boolean;
  hasVectorData: boolean;
  completenessScore: number;
  lastUpdated: Date;
}

export interface ClientProfileValidation {
  isValid: boolean;
  completenessScore: number;
  missingFields: string[];
  dataQualityIssues: string[];
  fallbacksApplied: string[];
}

export class ClientProfileManager {
  /**
   * Build a comprehensive client profile by combining intake data with categorized vector chunks
   */
  static buildClientProfile(
    clientIntake: ClientIntakeData | null, 
    categorizedChunks: CategorizedChunks,
    clientName?: string | null
  ): StructuredClientProfile {
    
    const profile: StructuredClientProfile = {
      clientId: clientIntake?.client_id || 'unknown',
      brandVoice: this.buildBrandVoiceProfile(clientIntake, categorizedChunks.brandVoice),
      demographics: this.buildDemographicProfile(clientIntake, categorizedChunks.demographics),
      property: this.buildPropertyProfile(clientIntake, categorizedChunks.propertyFeatures, categorizedChunks.localArea, clientName),
      competitor: this.buildCompetitorProfile(clientIntake, categorizedChunks.competitorIntelligence),
      hasIntakeData: !!clientIntake?.intake_completed,
      hasVectorData: this.hasValidVectorData(categorizedChunks),
      completenessScore: 0,
      lastUpdated: new Date()
    };

    // Calculate completeness score
    profile.completenessScore = this.calculateCompletenessScore(profile);

    return profile;
  }

  /**
   * Extract and structure brand voice information from intake data and chunks
   */
  private static buildBrandVoiceProfile(
    intake: ClientIntakeData | null, 
    brandChunks: ClassifiedChunk[]
  ): BrandVoiceProfile {
    
    const profile: BrandVoiceProfile = {
      tone: [],
      personality: [],
      communicationStyle: [],
      keyMessages: [],
      avoidWords: [],
      brandValues: [],
      voiceGuidelines: intake?.brand_voice_guidelines || ''
    };

    // Extract from intake data
    if (intake?.brand_voice_guidelines) {
      const guidelines = intake.brand_voice_guidelines.toLowerCase();
      
      // Extract tone indicators
      if (guidelines.includes('professional')) profile.tone.push('Professional');
      if (guidelines.includes('friendly')) profile.tone.push('Friendly');
      if (guidelines.includes('luxury') || guidelines.includes('premium')) profile.tone.push('Luxury');
      if (guidelines.includes('casual')) profile.tone.push('Casual');
      if (guidelines.includes('authoritative')) profile.tone.push('Authoritative');
      if (guidelines.includes('warm')) profile.tone.push('Warm');
      if (guidelines.includes('sophisticated')) profile.tone.push('Sophisticated');
      
      // Extract personality traits
      if (guidelines.includes('innovative')) profile.personality.push('Innovative');
      if (guidelines.includes('reliable')) profile.personality.push('Reliable');
      if (guidelines.includes('modern')) profile.personality.push('Modern');
      if (guidelines.includes('traditional')) profile.personality.push('Traditional');
      if (guidelines.includes('approachable')) profile.personality.push('Approachable');
      if (guidelines.includes('exclusive')) profile.personality.push('Exclusive');
    }

    // Extract from vector chunks
    brandChunks.forEach(chunk => {
      const content = chunk.content.toLowerCase();
      
      // Extract communication styles
      if (content.includes('direct communication')) profile.communicationStyle.push('Direct');
      if (content.includes('storytelling') || content.includes('narrative')) profile.communicationStyle.push('Storytelling');
      if (content.includes('data-driven') || content.includes('facts')) profile.communicationStyle.push('Data-driven');
      if (content.includes('emotional appeal')) profile.communicationStyle.push('Emotional');
      
      // Extract key messages and values
      if (content.includes('sustainability') || content.includes('eco-friendly')) profile.brandValues.push('Sustainability');
      if (content.includes('community') || content.includes('neighborhood')) profile.brandValues.push('Community');
      if (content.includes('luxury') || content.includes('premium')) profile.brandValues.push('Luxury');
      if (content.includes('innovation') || content.includes('technology')) profile.brandValues.push('Innovation');
      if (content.includes('service') || content.includes('customer care')) profile.brandValues.push('Service Excellence');
    });

    // Apply fallbacks if data is sparse
    if (profile.tone.length === 0) {
      profile.tone = ['Professional', 'Friendly'];
    }
    if (profile.personality.length === 0) {
      profile.personality = ['Reliable', 'Modern'];
    }
    if (profile.communicationStyle.length === 0) {
      profile.communicationStyle = ['Direct', 'Data-driven'];
    }

    return profile;
  }

  /**
   * Extract and structure demographic information from intake data and chunks
   */
  private static buildDemographicProfile(
    intake: ClientIntakeData | null, 
    demographicChunks: ClassifiedChunk[]
  ): DemographicProfile {
    
    const profile: DemographicProfile = {
      primaryAudience: intake?.target_audience || '',
      ageRange: [],
      incomeLevel: [],
      lifestyle: [],
      interests: [],
      painPoints: [],
      motivations: [],
      communicationPreferences: []
    };

    // Extract from intake data
    if (intake?.target_audience) {
      const audience = intake.target_audience.toLowerCase();
      
      // Age indicators
      if (audience.includes('young') || audience.includes('millennial')) profile.ageRange.push('25-35');
      if (audience.includes('gen z')) profile.ageRange.push('18-26');
      if (audience.includes('family') || audience.includes('families')) profile.ageRange.push('30-45');
      if (audience.includes('professional')) profile.ageRange.push('25-40');
      if (audience.includes('student')) profile.ageRange.push('18-25');
    }

    // ENHANCED: Extract detailed persona data from vector chunks
    demographicChunks.forEach(chunk => {
      const content = chunk.content;
      
      // Extract specific personas and ages with regex patterns
      const personaMatches = content.match(/(\w+),\s*(\d+)\s*years?\s*old[^.]*?([^.]*)/gi);
      if (personaMatches) {
        personaMatches.forEach(match => {
          const ageMatch = match.match(/(\d+)\s*years?\s*old/i);
          if (ageMatch) {
            const age = parseInt(ageMatch[1]);
            if (age >= 18 && age <= 25) profile.ageRange.push('18-25 (Gen Z)');
            else if (age >= 26 && age <= 35) profile.ageRange.push('26-35 (Millennials)');
            else if (age >= 36 && age <= 45) profile.ageRange.push('36-45 (Older Millennials)');
            else if (age >= 46 && age <= 55) profile.ageRange.push('46-55 (Gen X)');
          }
          
          // Extract job titles and income indicators
          if (match.toLowerCase().includes('founder') || match.toLowerCase().includes('ceo') || match.toLowerCase().includes('executive')) {
            profile.incomeLevel.push('High income (Executives/Founders)');
            profile.lifestyle.push('Entrepreneurial');
          }
          if (match.toLowerCase().includes('manager') || match.toLowerCase().includes('director')) {
            profile.incomeLevel.push('Upper-middle income (Management)');
            profile.lifestyle.push('Career-focused');
          }
          if (match.toLowerCase().includes('engineer') || match.toLowerCase().includes('developer') || match.toLowerCase().includes('tech')) {
            profile.incomeLevel.push('High income (Tech professionals)');
            profile.lifestyle.push('Tech-savvy');
          }
        });
      }

      // Extract mindset and psychographic insights
      const mindsetMatches = content.match(/mindset[:\s]*([^.\n]*)/gi);
      if (mindsetMatches) {
        mindsetMatches.forEach(match => {
          const mindset = match.replace(/mindset[:\s]*/i, '').toLowerCase();
          if (mindset.includes('ambitious')) {
            profile.motivations.push('Career advancement');
            profile.lifestyle.push('Achievement-oriented');
          }
          if (mindset.includes('convenience')) {
            profile.motivations.push('Convenience and efficiency');
            profile.painPoints.push('Time constraints');
          }
          if (mindset.includes('status')) {
            profile.motivations.push('Social status and prestige');
            profile.lifestyle.push('Status-conscious');
          }
          if (mindset.includes('risk')) {
            profile.lifestyle.push('Risk-taking');
            profile.motivations.push('Growth opportunities');
          }
        });
      }

      // Extract specific lifestyle details from rich content
      const content_lower = content.toLowerCase();
      
      // Work patterns
      if (content_lower.includes('work remotely') || content_lower.includes('100% remote')) {
        profile.lifestyle.push('Remote work');
        profile.motivations.push('Work-life balance');
      }
      if (content_lower.includes('co-working') || content_lower.includes('home office')) {
        profile.lifestyle.push('Flexible workspace needs');
        profile.interests.push('Professional networking');
      }
      
      // Technology adoption
      if (content_lower.includes('early adopters of technology') || content_lower.includes('keyless entry') || content_lower.includes('ev charging')) {
        profile.lifestyle.push('Tech early adopters');
        profile.interests.push('Smart technology');
      }
      
      // Transportation and location preferences
      if (content_lower.includes('electric vehicles') || content_lower.includes('ev')) {
        profile.lifestyle.push('Environmentally conscious');
        profile.interests.push('Sustainable living');
      }
      
      // Fitness and wellness
      if (content_lower.includes('gym') || content_lower.includes('yoga') || content_lower.includes('fitness')) {
        profile.lifestyle.push('Health and wellness focused');
        profile.interests.push('Fitness and wellness');
      }
      
      // Cultural and dining preferences
      if (content_lower.includes('asian community') || content_lower.includes('convoy district')) {
        profile.interests.push('Cultural diversity and authentic cuisine');
        profile.motivations.push('Cultural connection');
      }
      
      // Family and relationship status
      if (content_lower.includes('married') || content_lower.includes('couple')) {
        profile.lifestyle.push('Couples/Partnership living');
      }
      if (content_lower.includes('single')) {
        profile.lifestyle.push('Single professional');
        profile.motivations.push('Social connection opportunities');
      }
      if (content_lower.includes('parents visit') || content_lower.includes('guest suite')) {
        profile.lifestyle.push('Multi-generational considerations');
        profile.motivations.push('Flexible space for family');
      }

      // Income level indicators from LifeMode data
      if (content_lower.includes('lifemodes') || content_lower.includes('lifemode')) {
        if (content_lower.includes('metro renters') || content_lower.includes('emerald city')) {
          profile.incomeLevel.push('High income (Urban professionals)');
          profile.lifestyle.push('Urban metro lifestyle');
        }
        if (content_lower.includes('enterprising professionals')) {
          profile.incomeLevel.push('Very high income (Executives)');
          profile.lifestyle.push('Executive/Entrepreneurial');
        }
        if (content_lower.includes('young & restless')) {
          profile.ageRange.push('25-35 (Young professionals)');
          profile.lifestyle.push('Career building phase');
        }
      }

      // Extract specific demographics from ESRI data
      const demographicMatches = content.match(/(\d+)%\s*([^,\n]*)/gi);
      if (demographicMatches) {
        demographicMatches.forEach(match => {
          if (match.toLowerCase().includes('white') || match.toLowerCase().includes('asian') || match.toLowerCase().includes('hispanic')) {
            // Store ethnic diversity data for targeted messaging
            profile.communicationPreferences.push('Culturally diverse community appeal');
          }
          if (match.toLowerCase().includes('graduate') || match.toLowerCase().includes('bachelor')) {
            profile.lifestyle.push('Highly educated');
            profile.motivations.push('Intellectual community');
          }
        });
      }

      // Legacy keyword matching for fallback
      if (content_lower.includes('urban') || content_lower.includes('city')) profile.lifestyle.push('Urban');
      if (content_lower.includes('active') || content_lower.includes('fitness') || content_lower.includes('gym')) profile.lifestyle.push('Active');
      if (content_lower.includes('professional') || content_lower.includes('career')) profile.lifestyle.push('Career-focused');
      if (content_lower.includes('social') || content_lower.includes('community events')) profile.lifestyle.push('Social');
      if (content_lower.includes('tech') || content_lower.includes('digital')) profile.lifestyle.push('Tech-savvy');
      
      // Income indicators
      if (content_lower.includes('luxury') || content_lower.includes('premium')) profile.incomeLevel.push('High income');
      if (content_lower.includes('affordable') || content_lower.includes('budget')) profile.incomeLevel.push('Moderate income');
      if (content_lower.includes('middle income') || content_lower.includes('middle class')) profile.incomeLevel.push('Middle income');
      
      // Interests and motivations
      if (content_lower.includes('convenience') || content_lower.includes('location')) profile.motivations.push('Convenience');
      if (content_lower.includes('amenities') || content_lower.includes('features')) profile.motivations.push('Lifestyle amenities');
      if (content_lower.includes('investment') || content_lower.includes('value')) profile.motivations.push('Investment value');
      if (content_lower.includes('community') || content_lower.includes('neighborhood')) profile.motivations.push('Community connection');
      
      // Pain points
      if (content_lower.includes('commute') || content_lower.includes('transportation')) profile.painPoints.push('Long commute');
      if (content_lower.includes('space') || content_lower.includes('small')) profile.painPoints.push('Limited space');
      if (content_lower.includes('cost') || content_lower.includes('expensive')) profile.painPoints.push('High costs');
      if (content_lower.includes('maintenance') || content_lower.includes('upkeep')) profile.painPoints.push('Maintenance burden');
    });

    // Remove duplicates and apply fallbacks
    profile.ageRange = Array.from(new Set(profile.ageRange));
    profile.incomeLevel = Array.from(new Set(profile.incomeLevel));
    profile.lifestyle = Array.from(new Set(profile.lifestyle));
    profile.interests = Array.from(new Set(profile.interests));
    profile.motivations = Array.from(new Set(profile.motivations));
    profile.painPoints = Array.from(new Set(profile.painPoints));
    profile.communicationPreferences = Array.from(new Set(profile.communicationPreferences));

    // Apply fallbacks only if no data was extracted
    if (profile.ageRange.length === 0) {
      profile.ageRange = ['25-40'];
    }
    if (profile.incomeLevel.length === 0) {
      profile.incomeLevel = ['Middle income'];
    }
    if (profile.lifestyle.length === 0) {
      profile.lifestyle = ['Urban', 'Professional'];
    }

    return profile;
  }

  /**
   * Extract and structure property information from intake data and chunks
   */
  private static buildPropertyProfile(
    intake: ClientIntakeData | null,
    propertyChunks: ClassifiedChunk[],
    locationChunks: ClassifiedChunk[],
    clientName?: string | null
  ): PropertyProfile {
    
    const profile: PropertyProfile = {
      communityName: intake?.community_name || clientName || '',
      propertyType: intake?.community_type || '',
      uniqueFeatures: [],
      amenities: [],
      locationAdvantages: [],
      pricePoint: intake?.price_point || '',
      specialOffers: [],
      competitiveDifferentiators: []
    };

    // Extract from intake data
    if (intake?.unique_features) {
      profile.uniqueFeatures = intake.unique_features.split(',').map(f => f.trim());
    }
    if (intake?.amenities_highlights) {
      profile.amenities = intake.amenities_highlights.split(',').map(a => a.trim());
    }
    if (intake?.location_advantages) {
      profile.locationAdvantages = intake.location_advantages.split(',').map(l => l.trim());
    }
    if (intake?.special_promotions) {
      profile.specialOffers = intake.special_promotions.split(',').map(s => s.trim());
    }

    // Extract from property chunks
    propertyChunks.forEach(chunk => {
      const content = chunk.content.toLowerCase();
      
      // Amenities
      if (content.includes('pool') || content.includes('swimming')) profile.amenities.push('Pool');
      if (content.includes('gym') || content.includes('fitness')) profile.amenities.push('Fitness center');
      if (content.includes('parking') || content.includes('garage')) profile.amenities.push('Parking');
      if (content.includes('laundry') || content.includes('washer')) profile.amenities.push('In-unit laundry');
      if (content.includes('balcony') || content.includes('patio')) profile.amenities.push('Private outdoor space');
      if (content.includes('dishwasher')) profile.amenities.push('Dishwasher');
      if (content.includes('air conditioning') || content.includes('a/c')) profile.amenities.push('Air conditioning');
      if (content.includes('hardwood') || content.includes('wood floors')) profile.amenities.push('Hardwood floors');
      
      // Unique features
      if (content.includes('luxury') || content.includes('premium')) profile.competitiveDifferentiators.push('Luxury finishes');
      if (content.includes('new') || content.includes('newly built')) profile.competitiveDifferentiators.push('New construction');
      if (content.includes('pet-friendly') || content.includes('pets allowed')) profile.competitiveDifferentiators.push('Pet-friendly');
      if (content.includes('smart home') || content.includes('technology')) profile.competitiveDifferentiators.push('Smart home features');
    });

    // Extract from location chunks
    locationChunks.forEach(chunk => {
      const content = chunk.content.toLowerCase();
      
      // Location advantages
      if (content.includes('downtown') || content.includes('city center')) profile.locationAdvantages.push('Downtown location');
      if (content.includes('transit') || content.includes('subway') || content.includes('bus')) profile.locationAdvantages.push('Public transportation');
      if (content.includes('restaurant') || content.includes('dining')) profile.locationAdvantages.push('Dining options');
      if (content.includes('shopping') || content.includes('retail')) profile.locationAdvantages.push('Shopping nearby');
      if (content.includes('park') || content.includes('green space')) profile.locationAdvantages.push('Parks and recreation');
      if (content.includes('school') || content.includes('university')) profile.locationAdvantages.push('Education access');
      if (content.includes('hospital') || content.includes('medical')) profile.locationAdvantages.push('Healthcare access');
      if (content.includes('employer') || content.includes('business district')) profile.locationAdvantages.push('Employment centers');
    });

    // Remove duplicates
    profile.amenities = Array.from(new Set(profile.amenities));
    profile.locationAdvantages = Array.from(new Set(profile.locationAdvantages));
    profile.competitiveDifferentiators = Array.from(new Set(profile.competitiveDifferentiators));

    return profile;
  }

  /**
   * Extract and structure competitor information from intake data and chunks
   */
  private static buildCompetitorProfile(
    intake: ClientIntakeData | null,
    competitorChunks: ClassifiedChunk[]
  ): CompetitorProfile {
    
    const profile: CompetitorProfile = {
      competitors: [],
      competitiveAdvantages: [],
      differentiationPoints: [],
      marketPosition: '',
      pricingAdvantages: [],
      uniqueSellingPoints: []
    };

    // Extract from intake data
    if (intake?.competitor_info) {
      const competitors = intake.competitor_info.split(',').map(c => c.trim());
      profile.competitors = competitors;
    }

    // Extract from competitor chunks
    competitorChunks.forEach(chunk => {
      const content = chunk.content.toLowerCase();
      
      // Competitive advantages
      if (content.includes('better') || content.includes('superior')) {
        if (content.includes('amenities')) profile.competitiveAdvantages.push('Superior amenities');
        if (content.includes('location')) profile.competitiveAdvantages.push('Better location');
        if (content.includes('service')) profile.competitiveAdvantages.push('Better service');
        if (content.includes('value')) profile.competitiveAdvantages.push('Better value');
      }
      
      // Differentiation points
      if (content.includes('only') || content.includes('exclusive')) profile.differentiationPoints.push('Exclusive features');
      if (content.includes('first') || content.includes('innovative')) profile.differentiationPoints.push('Innovation leader');
      if (content.includes('largest') || content.includes('biggest')) profile.differentiationPoints.push('Market leader');
      
      // Pricing advantages
      if (content.includes('affordable') || content.includes('value')) profile.pricingAdvantages.push('Competitive pricing');
      if (content.includes('no fee') || content.includes('free')) profile.pricingAdvantages.push('No additional fees');
      if (content.includes('incentive') || content.includes('special offer')) profile.pricingAdvantages.push('Special incentives');
    });

    // Determine market position
    if (profile.competitiveAdvantages.includes('Superior amenities') || profile.differentiationPoints.includes('Exclusive features')) {
      profile.marketPosition = 'Premium';
    } else if (profile.pricingAdvantages.includes('Competitive pricing')) {
      profile.marketPosition = 'Value';
    } else {
      profile.marketPosition = 'Balanced';
    }

    return profile;
  }

  /**
   * Validate client profile completeness and quality
   */
  static validateClientProfile(profile: StructuredClientProfile): ClientProfileValidation {
    const validation: ClientProfileValidation = {
      isValid: true,
      completenessScore: profile.completenessScore,
      missingFields: [],
      dataQualityIssues: [],
      fallbacksApplied: []
    };

    // Check for missing critical fields
    if (!profile.brandVoice.tone.length) {
      validation.missingFields.push('Brand voice tone');
      validation.fallbacksApplied.push('Default tone applied');
    }
    
    if (!profile.demographics.primaryAudience) {
      validation.missingFields.push('Target audience');
      validation.fallbacksApplied.push('General audience assumed');
    }
    
    if (!profile.property.communityName) {
      validation.missingFields.push('Community name');
      validation.dataQualityIssues.push('Property identification unclear');
    }

    // Check data quality
    if (profile.demographics.ageRange.length === 0) {
      validation.dataQualityIssues.push('Age range not specified');
    }
    
    if (profile.property.amenities.length === 0) {
      validation.dataQualityIssues.push('No amenities identified');
    }

    // Determine overall validity
    validation.isValid = validation.missingFields.length <= 2 && 
                        validation.dataQualityIssues.length <= 3;

    return validation;
  }

  /**
   * Calculate completeness score based on available data
   */
  private static calculateCompletenessScore(profile: StructuredClientProfile): number {
    let score = 0;
    const maxScore = 100;

    // Brand voice (25 points)
    if (profile.brandVoice.voiceGuidelines) score += 10;
    if (profile.brandVoice.tone.length > 0) score += 5;
    if (profile.brandVoice.personality.length > 0) score += 5;
    if (profile.brandVoice.brandValues.length > 0) score += 5;

    // Demographics (25 points)
    if (profile.demographics.primaryAudience) score += 8;
    if (profile.demographics.ageRange.length > 0) score += 4;
    if (profile.demographics.lifestyle.length > 0) score += 4;
    if (profile.demographics.motivations.length > 0) score += 4;
    if (profile.demographics.painPoints.length > 0) score += 5;

    // Property (25 points)
    if (profile.property.communityName) score += 8;
    if (profile.property.amenities.length > 0) score += 5;
    if (profile.property.locationAdvantages.length > 0) score += 5;
    if (profile.property.uniqueFeatures.length > 0) score += 4;
    if (profile.property.pricePoint) score += 3;

    // Competitor (15 points)
    if (profile.competitor.competitors.length > 0) score += 5;
    if (profile.competitor.competitiveAdvantages.length > 0) score += 5;
    if (profile.competitor.marketPosition) score += 5;

    // Data sources (10 points)
    if (profile.hasIntakeData) score += 5;
    if (profile.hasVectorData) score += 5;

    return Math.round((score / maxScore) * 100);
  }

  /**
   * Check if vector data has meaningful content
   */
  private static hasValidVectorData(chunks: CategorizedChunks): boolean {
    const totalChunks = Object.values(chunks).reduce((sum, category) => sum + category.length, 0);
    return totalChunks >= 3; // Minimum threshold for meaningful vector data
  }

  /**
   * Generate a summary of the client profile for logging/debugging
   */
  static generateProfileSummary(profile: StructuredClientProfile): object {
    return {
      clientId: profile.clientId,
      completenessScore: profile.completenessScore,
      hasIntakeData: profile.hasIntakeData,
      hasVectorData: profile.hasVectorData,
      brandVoiceElements: {
        tone: profile.brandVoice.tone.length,
        personality: profile.brandVoice.personality.length,
        guidelines: !!profile.brandVoice.voiceGuidelines
      },
      demographicElements: {
        primaryAudience: !!profile.demographics.primaryAudience,
        ageRanges: profile.demographics.ageRange.length,
        lifestyleFactors: profile.demographics.lifestyle.length,
        motivations: profile.demographics.motivations.length
      },
      propertyElements: {
        communityName: !!profile.property.communityName,
        amenities: profile.property.amenities.length,
        locationAdvantages: profile.property.locationAdvantages.length,
        uniqueFeatures: profile.property.uniqueFeatures.length
      },
      competitorElements: {
        competitors: profile.competitor.competitors.length,
        advantages: profile.competitor.competitiveAdvantages.length,
        marketPosition: !!profile.competitor.marketPosition
      }
    };
  }
} 