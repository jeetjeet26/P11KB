import { StructuredCampaignContext } from './CampaignContextBuilder';
import { StructuredClientProfile } from './ClientProfileManager';
import { BrandVoiceValidationResult } from '../validation/BrandVoiceValidator';
import { TemplateManager } from './TemplateManager';

export interface RealEstateCampaignRequest {
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

export interface AdCopyExample {
  headlines: string[];
  descriptions: string[];
  context: {
    campaignType: string;
    adGroupType: string;
    brandVoiceTone: string[];
    targetDemographic: string;
    priceRange: string;
  };
  performanceMetrics?: {
    ctr: number;
    conversionRate: number;
    cpc: number;
  };
}

export interface PromptTemplate {
  structure: string;
  sections: {
    roleDefinition: string;
    campaignBrief: string;
    brandVoiceGuidelines: string;
    targetAudienceInsights: string;
    propertyHighlights: string;
    competitiveDifferentiation: string;
    locationAdvantages: string;
    exampleDrivenGuidance: string;
    technicalRequirements: string;
    outputFormat: string;
  };
}

export class EnhancedPromptGenerator {
  private static readonly AD_COPY_EXAMPLES: { [key: string]: AdCopyExample[] } = {
    're_general_location': [
      {
        headlines: ['Downtown Living Awaits', 'Urban Luxury Found', 'City Life Redefined', 'Prime Location Living', 'Metro Life Starts Here'],
        descriptions: ['Experience the best of city living with premium amenities and unbeatable location.', 'Your urban oasis awaits in the heart of downtown.'],
        context: {
          campaignType: 're_general_location',
          adGroupType: 'location_general',
          brandVoiceTone: ['Modern', 'Sophisticated'],
          targetDemographic: 'Young professionals',
          priceRange: 'Premium'
        }
      },
      {
        headlines: ['Cozy Neighborhood Charm', 'Family-Friendly Living', 'Quiet Street Vibes', 'Community Feel Here', 'Peaceful Yet Connected'],
        descriptions: ['Discover family-friendly living in a welcoming neighborhood community.', 'The perfect balance of tranquility and convenience awaits you.'],
        context: {
          campaignType: 're_general_location',
          adGroupType: 'location_specific',
          brandVoiceTone: ['Warm', 'Welcoming'],
          targetDemographic: 'Families',
          priceRange: 'Mid-market'
        }
      }
    ],
    're_unit_type': [
      {
        headlines: ['Studio Perfection', 'Efficiency Meets Style', 'Smart Studio Living', 'Compact Luxury', 'Studio Life Elevated'],
        descriptions: ['Maximize your lifestyle in a thoughtfully designed studio apartment.', 'Everything you need in one perfectly planned space.'],
        context: {
          campaignType: 're_unit_type',
          adGroupType: 'studio',
          brandVoiceTone: ['Efficient', 'Smart'],
          targetDemographic: 'Young professionals, students',
          priceRange: 'Value'
        }
      },
      {
        headlines: ['Spacious 2BR Haven', 'Room to Grow & Thrive', 'Perfect for Families', 'Two Bed Sanctuary', 'Space for Everything'],
        descriptions: ['Enjoy spacious 2-bedroom living with room for work, rest, and play.', 'Perfect for families, roommates, or those who love extra space.'],
        context: {
          campaignType: 're_unit_type',
          adGroupType: '2br',
          brandVoiceTone: ['Comfortable', 'Spacious'],
          targetDemographic: 'Families, roommates',
          priceRange: 'Mid-market'
        }
      }
    ],
    're_proximity': [
      {
        headlines: ['Steps from Campus', 'University Living', 'Walk to Classes', 'Student Life Central', 'Campus Edge Living'],
        descriptions: ['Live just minutes from campus with easy access to university life.', 'Perfect for students who want convenience and community.'],
        context: {
          campaignType: 're_proximity',
          adGroupType: 'near_schools',
          brandVoiceTone: ['Energetic', 'Convenient'],
          targetDemographic: 'Students',
          priceRange: 'Student-friendly'
        }
      },
      {
        headlines: ['Transit at Your Door', 'Commute Made Easy', 'Train Station Close', 'No Car Needed', 'Transit Convenient'],
        descriptions: ['Skip the car payments with direct access to public transportation.', 'Effortless commuting to anywhere in the city awaits you.'],
        context: {
          campaignType: 're_proximity',
          adGroupType: 'near_transit',
          brandVoiceTone: ['Practical', 'Convenient'],
          targetDemographic: 'Commuters',
          priceRange: 'Value-conscious'
        }
      }
    ]
  };

  private static readonly BRAND_VOICE_EXAMPLES: { [key: string]: string[] } = {
    'luxury': ['Exclusive', 'Elevated', 'Sophisticated', 'Premium', 'Refined'],
    'friendly': ['Welcoming', 'Comfortable', 'Warm', 'Inviting', 'Home'],
    'modern': ['Contemporary', 'Sleek', 'Smart', 'Urban', 'Tech-Enabled'],
    'professional': ['Quality', 'Excellence', 'Reliable', 'Trusted', 'Professional'],
    'energetic': ['Vibrant', 'Dynamic', 'Active', 'Lively', 'Exciting']
  };

  /**
   * Generate enhanced prompt using structured context and examples
   */
  static generateEnhancedPrompt(
    request: RealEstateCampaignRequest,
    campaignContext: StructuredCampaignContext,
    clientProfile: StructuredClientProfile,
    brandVoiceValidation?: BrandVoiceValidationResult
  ): string {
    
    // Build the enhanced prompt template
    const template = this.buildPromptTemplate(campaignContext, clientProfile);
    
    // Select relevant examples
    const relevantExamples = this.selectRelevantExamples(request, clientProfile, campaignContext);
    
    // Generate contextual sections
    const roleDefinition = this.generateRoleDefinition(campaignContext.contextStrength);
    const campaignBrief = this.generateCampaignBrief(request, campaignContext);
    const brandVoiceSection = this.generateBrandVoiceSection(campaignContext, clientProfile);
    const audienceSection = this.generateAudienceSection(campaignContext, clientProfile);
    const propertySection = this.generatePropertySection(campaignContext, clientProfile);
    const competitorSection = this.generateCompetitorSection(campaignContext, clientProfile);
    const locationSection = this.generateLocationSection(campaignContext, request);
    const exampleSection = this.generateExampleSection(relevantExamples, campaignContext, clientProfile, request);
    const technicalSection = this.generateTechnicalRequirements(request);
    const outputSection = this.generateOutputFormat();

    return this.assemblePrompt({
      roleDefinition,
      campaignBrief,
      brandVoiceGuidelines: brandVoiceSection,
      targetAudienceInsights: audienceSection,
      propertyHighlights: propertySection,
      competitiveDifferentiation: competitorSection,
      locationAdvantages: locationSection,
      exampleDrivenGuidance: exampleSection,
      technicalRequirements: technicalSection,
      outputFormat: outputSection
    });
  }

  /**
   * Build prompt template based on context strength and client profile
   */
  private static buildPromptTemplate(
    context: StructuredCampaignContext,
    profile: StructuredClientProfile
  ): PromptTemplate {
    
    const hasStrongContext = context.contextStrength === 'strong';
    const hasIntakeData = profile.hasIntakeData;
    
    return {
      structure: hasStrongContext ? 'comprehensive' : 'streamlined',
      sections: {
        roleDefinition: hasStrongContext ? 'expert_with_context' : 'standard_expert',
        campaignBrief: 'detailed',
        brandVoiceGuidelines: hasIntakeData ? 'comprehensive' : 'standard',
        targetAudienceInsights: context.contextSections.targetAudience.priority === 'high' ? 'detailed' : 'basic',
        propertyHighlights: context.contextSections.propertyHighlights.priority === 'high' ? 'comprehensive' : 'standard',
        competitiveDifferentiation: context.contextSections.competitiveAdvantages.priority === 'high' ? 'detailed' : 'basic',
        locationAdvantages: context.contextSections.locationBenefits.priority === 'high' ? 'comprehensive' : 'standard',
        exampleDrivenGuidance: 'adaptive',
        technicalRequirements: 'strict',
        outputFormat: 'json_structured'
      }
    };
  }

  /**
   * Select relevant examples based on campaign type and client profile
   */
  private static selectRelevantExamples(
    request: RealEstateCampaignRequest,
    clientProfile: StructuredClientProfile,
    context: StructuredCampaignContext
  ): AdCopyExample[] {
    
    const campaignExamples = this.AD_COPY_EXAMPLES[request.campaignType] || [];
    
    return campaignExamples.filter(example => {
      // Match ad group type (if specified)
      if (request.adGroupType && example.context.adGroupType === request.adGroupType) return true;
      
      // Match brand voice tone
      const clientTones = clientProfile.brandVoice.tone.map(t => t.toLowerCase());
      const exampleTones = example.context.brandVoiceTone.map(t => t.toLowerCase());
      if (clientTones.some(tone => exampleTones.includes(tone))) return true;
      
      // Match target demographic
      const clientDemo = clientProfile.demographics.primaryAudience?.toLowerCase() || '';
      const exampleDemo = example.context.targetDemographic.toLowerCase();
      if (clientDemo.includes(exampleDemo) || exampleDemo.includes(clientDemo)) return true;
      
      return false;
    }).slice(0, 3); // Limit to 3 most relevant examples
  }

  /**
   * Generate role definition section
   */
  private static generateRoleDefinition(contextStrength: string): string {
    if (contextStrength === 'strong') {
      return `ROLE: You are a Senior Digital Marketing Strategist and Real Estate Copy Expert with deep knowledge of Google Ads optimization for multifamily and luxury residential properties. You have access to comprehensive client intelligence and market insights that enable you to create highly targeted, conversion-optimized ad copy.`;
    } else {
      return `ROLE: You are a Senior Digital Marketing Strategist specializing in Google Ads for real estate properties, with expertise in creating compelling ad copy that drives qualified leads and conversions.`;
    }
  }

  /**
   * Generate campaign brief section
   */
  private static generateCampaignBrief(
    request: RealEstateCampaignRequest,
    context: StructuredCampaignContext
  ): string {
    
    let brief = `CAMPAIGN BRIEF:
Campaign Type: ${context.campaignType.replace('re_', '').replace('_', ' ').toUpperCase()}`;

    // Add focus information based on campaign type
    if (request.campaignType === 're_unit_type') {
      brief += `\nAd Group Focus: ${request.adGroupType?.replace('_', ' ') || 'Unknown'}`;
    } else if (request.campaignType === 're_general_location') {
      brief += `\nHeadline Distribution: Distributed across Location General, Location Specific, and Location Amenities focuses`;
    } else if (request.campaignType === 're_proximity') {
      brief += `\nHeadline Distribution: Distributed across Near Landmarks, Near Transit, Near Employers, and Near Schools focuses`;
    }

    brief += `\nTarget Location: ${request.location.city}, ${request.location.state}
Context Strength: ${context.contextStrength.toUpperCase()} (Relevance Score: ${context.overallRelevanceScore}/100)`;

    if (request.unitDetails) {
      brief += `\nUnit Specifications: ${request.unitDetails.bedrooms}BR/${request.unitDetails.bathrooms}BA`;
      if (request.unitDetails.sqft) brief += `, ${request.unitDetails.sqft} sqft`;
      if (request.unitDetails.unitType) brief += `, ${request.unitDetails.unitType}`;
    }

    if (request.proximityTargets?.length) {
      brief += `\nProximity Targets: ${request.proximityTargets.join(', ')}`;
    }

    if (request.priceRange) {
      brief += `\nPricing Context: ${request.priceRange}`;
    }

    if (request.specialOffers) {
      brief += `\nSpecial Offers: ${request.specialOffers}`;
    }

    return brief;
  }

  /**
   * Generate brand voice section from structured context
   */
  private static generateBrandVoiceSection(
    context: StructuredCampaignContext,
    profile: StructuredClientProfile
  ): string {
    
    const brandSection = context.contextSections.brandVoice;
    let section = `BRAND VOICE GUIDELINES [Priority: ${brandSection.priority.toUpperCase()}, Score: ${brandSection.relevanceScore}/100]:
${brandSection.content}`;

    // Add specific tone guidance
    if (profile.brandVoice.tone.length > 0) {
      section += `\n\nTONE REQUIREMENTS: Maintain ${profile.brandVoice.tone.join(' and ')} tone throughout all copy`;
      
      // Add tone-specific word suggestions
      const toneWords = profile.brandVoice.tone.flatMap(tone => 
        this.BRAND_VOICE_EXAMPLES[tone.toLowerCase()] || []
      ).slice(0, 10);
      
      if (toneWords.length > 0) {
        section += `\nPreferred Brand Voice Words: ${toneWords.join(', ')}`;
      }
    }

    // Add communication style guidance
    if (profile.brandVoice.communicationStyle.length > 0) {
      section += `\nCommunication Style: ${profile.brandVoice.communicationStyle.join(', ')}`;
    }

    // Add words to avoid if specified
    if (profile.brandVoice.avoidWords.length > 0) {
      section += `\nAVOID THESE WORDS/PHRASES: ${profile.brandVoice.avoidWords.join(', ')}`;
    }

    return section;
  }

  /**
   * Generate target audience section with rich persona-based insights
   */
  private static generateAudienceSection(
    context: StructuredCampaignContext,
    profile: StructuredClientProfile
  ): string {
    
    const audienceSection = context.contextSections.targetAudience;
    let section = `TARGET AUDIENCE INSIGHTS [Priority: ${audienceSection.priority.toUpperCase()}, Score: ${audienceSection.relevanceScore}/100]:
${audienceSection.content}`;

    // Add specific age and demographic targeting
    if (profile.demographics.ageRange.length > 0) {
      section += `\n\nSPECIFIC AGE TARGETING: ${profile.demographics.ageRange.join(', ')}`;
      
      // Add age-specific messaging guidance
      const hasMillennials = profile.demographics.ageRange.some(age => age.includes('Millennials') || age.includes('26-35'));
      const hasGenZ = profile.demographics.ageRange.some(age => age.includes('Gen Z') || age.includes('18-25'));
      
      if (hasMillennials) {
        section += `\nMillennial Messaging: Focus on work-life balance, technology integration, and social experiences`;
      }
      if (hasGenZ) {
        section += `\nGen Z Messaging: Emphasize authenticity, sustainability, and digital-first experiences`;
      }
    }

    // Add income-level specific messaging
    if (profile.demographics.incomeLevel.length > 0) {
      section += `\n\nINCOME-BASED POSITIONING: ${profile.demographics.incomeLevel.join(', ')}`;
      
      const hasHighIncome = profile.demographics.incomeLevel.some(income => 
        income.includes('High income') || income.includes('Very high income') || income.includes('Executives')
      );
      const hasTechProfessionals = profile.demographics.incomeLevel.some(income => 
        income.includes('Tech professionals')
      );
      
      if (hasHighIncome) {
        section += `\nHigh-Income Messaging: Emphasize luxury, exclusivity, premium amenities, and status appeal`;
      }
      if (hasTechProfessionals) {
        section += `\nTech Professional Messaging: Highlight smart home features, high-speed internet, co-working spaces`;
      }
    }

    // Enhanced psychographic insights
    if (profile.demographics.motivations.length > 0) {
      section += `\n\nKEY MOTIVATIONS TO ADDRESS: ${profile.demographics.motivations.join(', ')}`;
      
      // Add motivation-specific copy guidance
      if (profile.demographics.motivations.includes('Career advancement')) {
        section += `\n  - Career Focus: Mention proximity to business districts, networking opportunities, professional amenities`;
      }
      if (profile.demographics.motivations.includes('Convenience and efficiency')) {
        section += `\n  - Convenience Focus: Emphasize time-saving features, location benefits, smart technology`;
      }
      if (profile.demographics.motivations.includes('Social status and prestige')) {
        section += `\n  - Status Focus: Highlight prestige address, luxury finishes, exclusive amenities`;
      }
    }

    if (profile.demographics.painPoints.length > 0) {
      section += `\n\nPAIN POINTS TO SOLVE: ${profile.demographics.painPoints.join(', ')}`;
      
      // Add pain point solutions
      if (profile.demographics.painPoints.includes('Time constraints')) {
        section += `\n  - Time Solution: Emphasize convenience, nearby amenities, easy commute access`;
      }
      if (profile.demographics.painPoints.includes('Long commute')) {
        section += `\n  - Commute Solution: Highlight transportation access, work-from-home features, central location`;
      }
    }

    // Enhanced lifestyle targeting with specific messaging
    if (profile.demographics.lifestyle.length > 0) {
      section += `\n\nLIFESTYLE ALIGNMENT: ${profile.demographics.lifestyle.join(', ')}`;
      
      // Add lifestyle-specific messaging guidance
      if (profile.demographics.lifestyle.includes('Entrepreneurial') || profile.demographics.lifestyle.includes('Achievement-oriented')) {
        section += `\n  - Entrepreneur Appeal: Mention business centers, networking spaces, success-oriented community`;
      }
      if (profile.demographics.lifestyle.includes('Tech early adopters') || profile.demographics.lifestyle.includes('Tech-savvy')) {
        section += `\n  - Tech Appeal: Highlight smart home features, high-speed internet, EV charging, keyless entry`;
      }
      if (profile.demographics.lifestyle.includes('Health and wellness focused')) {
        section += `\n  - Wellness Appeal: Emphasize fitness facilities, yoga studios, outdoor spaces, healthy lifestyle`;
      }
      if (profile.demographics.lifestyle.includes('Environmentally conscious')) {
        section += `\n  - Eco Appeal: Mention sustainable features, EV charging, green building certifications, bike storage`;
      }
      if (profile.demographics.lifestyle.includes('Remote work')) {
        section += `\n  - Remote Work Appeal: Highlight home office space, co-working areas, high-speed internet, quiet environments`;
      }
    }

    // Add interests-based messaging
    if (profile.demographics.interests.length > 0) {
      section += `\n\nINTEREST-BASED MESSAGING: ${profile.demographics.interests.join(', ')}`;
      
      if (profile.demographics.interests.includes('Cultural diversity and authentic cuisine')) {
        section += `\n  - Cultural Appeal: Mention diverse dining options, cultural proximity, international community`;
      }
      if (profile.demographics.interests.includes('Smart technology')) {
        section += `\n  - Tech Appeal: Emphasize smart home integration, app-controlled features, digital amenities`;
      }
    }

    // Add communication preferences if available
    if (profile.demographics.communicationPreferences.length > 0) {
      section += `\n\nCOMMUNICATION APPROACH: ${profile.demographics.communicationPreferences.join(', ')}`;
    }

    return section;
  }

  /**
   * Generate property highlights section
   */
  private static generatePropertySection(
    context: StructuredCampaignContext,
    profile: StructuredClientProfile
  ): string {
    
    const propertySection = context.contextSections.propertyHighlights;
    let section = `PROPERTY HIGHLIGHTS [Priority: ${propertySection.priority.toUpperCase()}, Score: ${propertySection.relevanceScore}/100]:
${propertySection.content}`;

    // Add community-specific messaging
    if (profile.property.communityName) {
      section += `\n\nCOMMUNITY BRANDING: Always reference "${profile.property.communityName}" when appropriate`;
    }

    return section;
  }

  /**
   * Generate competitive differentiation section
   */
  private static generateCompetitorSection(
    context: StructuredCampaignContext,
    profile: StructuredClientProfile
  ): string {
    
    const competitorSection = context.contextSections.competitiveAdvantages;
    
    if (competitorSection.priority === 'low' && competitorSection.relevanceScore < 20) {
      return `COMPETITIVE DIFFERENTIATION: Focus on unique property features and location benefits to stand out in the market.`;
    }

    return `COMPETITIVE DIFFERENTIATION [Priority: ${competitorSection.priority.toUpperCase()}, Score: ${competitorSection.relevanceScore}/100]:
${competitorSection.content}`;
  }

  /**
   * Generate location advantages section
   */
  private static generateLocationSection(
    context: StructuredCampaignContext,
    request: RealEstateCampaignRequest
  ): string {
    
    const locationSection = context.contextSections.locationBenefits;
    let section = `LOCATION ADVANTAGES [Priority: ${locationSection.priority.toUpperCase()}, Score: ${locationSection.relevanceScore}/100]:
${locationSection.content}`;

    // Add campaign-specific location guidance
    if (request.campaignType === 're_proximity' && request.proximityTargets?.length) {
      section += `\n\nPROXIMITY MESSAGING FOCUS: Emphasize convenience and time-saving benefits of being near ${request.proximityTargets.join(', ')}`;
    }

    return section;
  }

  /**
   * Generate example-driven guidance section with template integration
   */
  private static generateExampleSection(
    examples: AdCopyExample[],
    context: StructuredCampaignContext,
    clientProfile: StructuredClientProfile,
    request: RealEstateCampaignRequest
  ): string {
    
    let section = `EXAMPLE-DRIVEN GUIDANCE & TEMPLATES:`;

    // Add template-based examples first
    const templateExamples = TemplateManager.generateTemplateExamples(context, clientProfile, request);
    const templateInsights = TemplateManager.generateTemplateInsights(context, clientProfile) as {
      availableTemplates: number;
      templateNames: string[];
      campaignTypeMatch: number;
      adGroupTypeMatch: number;
      brandVoiceMatch: number;
    };
    
    section += `\n\nTEMPLATE INSIGHTS: ${templateInsights.availableTemplates} matching templates found`;
    if (templateInsights.availableTemplates > 0) {
      section += `\nMatching Templates: ${templateInsights.templateNames.join(', ')}`;
    }
    
    section += `\n\n${templateExamples}`;

    // Add successful examples for additional inspiration
    if (examples.length > 0) {
      section += `\n\nSUCCESSFUL EXAMPLES FOR INSPIRATION:`;
      section += `\nUse these proven examples while adapting to your specific context:`;

      examples.forEach((example, index) => {
        section += `\n\nExample ${index + 1} (${example.context.brandVoiceTone.join(', ')} tone):`;
        section += `\nSample Headlines: ${example.headlines.slice(0, 3).join(' | ')}`;
        section += `\nSample Descriptions: ${example.descriptions.slice(0, 2).join(' | ')}`;
      });
    }

    section += `\n\nADAPTATION STRATEGY:
- Start with template patterns for efficiency and proven structure
- Customize with your specific variables (location, community, unit details)
- Adapt tone and messaging to match client brand voice
- Incorporate client-specific features and benefits from your context
- Ensure relevance to target demographic and campaign focus
- Maintain strict character limits while maximizing impact`;

    return section;
  }

  /**
   * Generate technical requirements section
   */
  private static generateTechnicalRequirements(request: RealEstateCampaignRequest): string {
    let requirements = `TECHNICAL REQUIREMENTS:
- EXACTLY 15 headlines, each ≤30 characters including spaces
- EXACTLY 4 descriptions, each ≤90 characters including spaces
- Keywords: 50-100 total with proper match type distribution
- Exact Match: [keyword] format for highly specific terms
- Phrase Match: "keyword phrase" format for moderate targeting
- Broad Match: keyword phrase format for broader reach
- Negative Keywords: 20-30 terms to exclude irrelevant traffic`;

    // Add distributed focus requirements for general location and proximity campaigns
    if (request.campaignType === 're_general_location' && (!request.adGroupType || request.adGroupType === 'distributed_focus')) {
      requirements += `

DISTRIBUTED HEADLINE REQUIREMENTS FOR GENERAL LOCATION CAMPAIGN:
- Distribute 15 headlines across these focuses (at least 1 headline per focus):
  * Location General: Broad city/area terms (5+ headlines)
  * Location Specific: Neighborhood/district specifics (5+ headlines)  
  * Location Amenities: Location + amenity combinations (5+ headlines)
- Each headline should represent one primary focus while maintaining variety
- Ensure comprehensive coverage across all three focus areas`;
    }

    if (request.campaignType === 're_proximity' && (!request.adGroupType || request.adGroupType === 'distributed_focus')) {
      requirements += `

DISTRIBUTED HEADLINE REQUIREMENTS FOR PROXIMITY CAMPAIGN:
- Distribute 15 headlines across these focuses (at least 1 headline per focus):
  * Near Landmarks: Popular attractions, parks, entertainment (4+ headlines)
  * Near Transit: Bus, train, metro, transportation hubs (4+ headlines)
  * Near Employers: Major companies, business districts, offices (4+ headlines)
  * Near Schools: Universities, colleges, schools (3+ headlines)
- Each headline should emphasize proximity and convenience benefits
- Use terms like "Near", "Close to", "Minutes from", "Walking distance"`;
    }

    requirements += `

CHARACTER EFFICIENCY TIPS:
- Use abbreviations: "BR" for bedroom, "BA" for bathroom
- Leverage action words: "Tour", "Call", "Visit", "Apply"
- Include location: "${request.location.city}" or "${request.location.state}"
- Price indicators: "From $X", "Starting at", "Under $X"`;

    return requirements;
  }

  /**
   * Generate output format section
   */
  private static generateOutputFormat(): string {
    return `OUTPUT FORMAT:
Return ONLY a valid JSON object with this exact structure (no additional text):

{
  "headlines": ["Headline 1", "Headline 2", "Headline 3", "Headline 4", "Headline 5", "Headline 6", "Headline 7", "Headline 8", "Headline 9", "Headline 10", "Headline 11", "Headline 12", "Headline 13", "Headline 14", "Headline 15"],
  "descriptions": ["Description 1", "Description 2", "Description 3", "Description 4"],
  "keywords": {
    "exact_match": ["[keyword1]", "[keyword2]"],
    "phrase_match": ["\\"phrase keyword\\"", "\\"another phrase\\""],
    "broad_match": ["broad keyword", "another broad"],
    "negative_keywords": ["negative1", "negative2"]
  },
  "final_url_paths": ["suggested-path-1", "suggested-path-2", "suggested-path-3"]
}`;
  }

  /**
   * Assemble the final prompt from all sections
   */
  private static assemblePrompt(sections: {
    roleDefinition: string;
    campaignBrief: string;
    brandVoiceGuidelines: string;
    targetAudienceInsights: string;
    propertyHighlights: string;
    competitiveDifferentiation: string;
    locationAdvantages: string;
    exampleDrivenGuidance: string;
    technicalRequirements: string;
    outputFormat: string;
  }): string {
    
    return `${sections.roleDefinition}

==================================================
${sections.campaignBrief}

==================================================
${sections.brandVoiceGuidelines}

==================================================
${sections.targetAudienceInsights}

==================================================
${sections.propertyHighlights}

==================================================
${sections.competitiveDifferentiation}

==================================================
${sections.locationAdvantages}

==================================================
${sections.exampleDrivenGuidance}

==================================================
${sections.technicalRequirements}

==================================================
${sections.outputFormat}

CRITICAL REMINDERS:
- Focus on REAL ESTATE content only
- Maintain brand voice consistency throughout
- Ensure all copy drives qualified leads and conversions
- Return ONLY valid JSON, no additional text or commentary
- Character limits are STRICTLY enforced by Google Ads`;
  }
} 