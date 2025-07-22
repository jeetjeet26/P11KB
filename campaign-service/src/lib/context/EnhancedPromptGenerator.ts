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
    keywordStrategy: string;
    exampleDrivenGuidance: string;
    technicalRequirements: string;
    outputFormat: string;
  };
}

export class EnhancedPromptGenerator {
  private static readonly AD_COPY_EXAMPLES: { [key: string]: AdCopyExample[] } = {
    're_general_location': [
      {
        headlines: ['Downtown Living Awaits', 'Urban Luxury Living Found', 'City Life Redefined Here', 'Prime Location Living Now', 'Metro Life Starts Today'],
        descriptions: ['Experience the best of city living with premium amenities and location.', 'Your urban oasis awaits in the heart of downtown with modern features.'],
        context: {
          campaignType: 're_general_location',
          adGroupType: 'location_general',
          brandVoiceTone: ['Modern', 'Sophisticated'],
          targetDemographic: 'Young professionals',
          priceRange: 'Premium'
        }
      },
      {
        headlines: ['Cozy Neighborhood Charm', 'Family-Friendly Living', 'Quiet Street Vibes Here', 'Community Feel Living', 'Peaceful Yet Connected'],
        descriptions: ['Discover family-friendly living in a welcoming neighborhood community.', 'The perfect balance of tranquility and convenience awaits you here.'],
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
        headlines: ['Studio Perfection Here', 'Efficiency Meets Style', 'Smart Studio Living Now', 'Compact Luxury Living', 'Studio Life Elevated'],
        descriptions: ['Maximize your lifestyle in a thoughtfully designed studio apartment space.', 'Everything you need in one perfectly planned space with amenities.'],
        context: {
          campaignType: 're_unit_type',
          adGroupType: 'studio',
          brandVoiceTone: ['Efficient', 'Smart'],
          targetDemographic: 'Young professionals, students',
          priceRange: 'Value'
        }
      },
      {
        headlines: ['Spacious 2BR Haven Now', 'Room to Grow & Thrive', 'Perfect for Families', 'Two Bed Sanctuary Here', 'Space for Everything'],
        descriptions: ['Enjoy spacious 2-bedroom living with room for work, rest, and play.', 'Perfect for families, roommates, or those who love extra space here.'],
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
        headlines: ['Steps from Campus Now', 'University Living Here', 'Walk to Classes Daily', 'Student Life Central', 'Campus Edge Living'],
        descriptions: ['Live just minutes from campus with easy access to university life daily.', 'Perfect for students who want convenience and community near campus.'],
        context: {
          campaignType: 're_proximity',
          adGroupType: 'near_schools',
          brandVoiceTone: ['Energetic', 'Convenient'],
          targetDemographic: 'Students',
          priceRange: 'Student-friendly'
        }
      },
      {
        headlines: ['Transit at Your Door', 'Commute Made Easy Now', 'Train Station Close By', 'No Car Needed Here', 'Transit Convenient Daily'],
        descriptions: ['Skip the car payments with direct access to public transportation.', 'Effortless commuting to anywhere in the city awaits you every day.'],
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
    const keywordStrategy = this.generateKeywordStrategy(request, clientProfile);
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
      keywordStrategy: keywordStrategy,
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
        keywordStrategy: 'campaign_specific',
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
   * Generate campaign-specific keyword examples and strategy
   */
  private static generateKeywordStrategy(
    request: RealEstateCampaignRequest,
    clientProfile: StructuredClientProfile
  ): string {
    const location = request.location;
    const campaignType = request.campaignType;
    const adGroupType = request.adGroupType || 'distributed_focus';
    
    let keywordExamples: string[] = [];
    let specificNegatives: string[] = [];
    
    // Generate campaign-specific keyword examples
    if (campaignType === 're_general_location') {
      if (adGroupType === 'location_general' || adGroupType === 'distributed_focus') {
        keywordExamples.push(
          `${location.city} apartments`,
          `${location.city} housing`,
          `downtown ${location.city}`,
          `${location.city} living`,
          `urban living ${location.city}`,
          `metro ${location.city}`,
          `${location.state} apartments`,
          `city living ${location.city}`
        );
      }
      if (adGroupType === 'location_specific' || adGroupType === 'distributed_focus') {
        keywordExamples.push(
          `${location.city} downtown apartments`,
          `${location.city} neighborhood living`,
          `historic district ${location.city}`,
          `waterfront ${location.city}`,
          `${location.city} district apartments`
        );
      }
      if (adGroupType === 'location_amenities' || adGroupType === 'distributed_focus') {
        keywordExamples.push(
          `walkable ${location.city}`,
          `${location.city} transit`,
          `${location.city} restaurants nearby`,
          `parks near ${location.city}`,
          `${location.city} entertainment`
        );
      }
    }
    
    else if (campaignType === 're_unit_type') {
      const unitType = request.unitDetails?.bedrooms;
      if (adGroupType === 'studio') {
        keywordExamples.push(
          `studio apartment ${location.city}`,
          `efficiency ${location.city}`,
          `compact living ${location.city}`,
          `studio downtown ${location.city}`,
          `small apartment ${location.city}`,
          `affordable studio ${location.city}`
        );
        specificNegatives.push('1 bedroom', '2 bedroom', '3 bedroom', 'family');
      }
      else if (adGroupType === '1br') {
        keywordExamples.push(
          `1 bedroom ${location.city}`,
          `one bedroom ${location.city}`,
          `1br apartment ${location.city}`,
          `single bedroom ${location.city}`,
          `couples apartment ${location.city}`
        );
        specificNegatives.push('studio', '2 bedroom', '3 bedroom');
      }
      else if (adGroupType === '2br') {
        keywordExamples.push(
          `2 bedroom ${location.city}`,
          `two bedroom ${location.city}`,
          `2br apartment ${location.city}`,
          `roommate ${location.city}`,
          `family apartment ${location.city}`
        );
        specificNegatives.push('studio', '1 bedroom', '3 bedroom');
      }
      else if (adGroupType === '3br') {
        keywordExamples.push(
          `3 bedroom ${location.city}`,
          `three bedroom ${location.city}`,
          `family housing ${location.city}`,
          `spacious apartment ${location.city}`,
          `large apartment ${location.city}`
        );
        specificNegatives.push('studio', '1 bedroom', '2 bedroom');
      }
      else if (adGroupType === '4br_plus') {
        keywordExamples.push(
          `4 bedroom ${location.city}`,
          `large family ${location.city}`,
          `luxury apartment ${location.city}`,
          `spacious housing ${location.city}`,
          `premium living ${location.city}`
        );
        specificNegatives.push('studio', '1 bedroom', '2 bedroom', '3 bedroom');
      }
    }
    
    else if (campaignType === 're_proximity') {
      if (request.proximityTargets?.length) {
        request.proximityTargets.forEach(target => {
          keywordExamples.push(
            `near ${target}`,
            `close to ${target}`,
            `${target} nearby`,
            `walking distance ${target}`
          );
        });
      }
      
      if (adGroupType === 'near_schools' || adGroupType === 'distributed_focus') {
        keywordExamples.push(
          `student housing ${location.city}`,
          `university apartments ${location.city}`,
          `college housing ${location.city}`,
          `campus living ${location.city}`
        );
      }
      if (adGroupType === 'near_transit' || adGroupType === 'distributed_focus') {
        keywordExamples.push(
          `metro accessible ${location.city}`,
          `train station ${location.city}`,
          `public transport ${location.city}`,
          `commuter friendly ${location.city}`
        );
      }
      if (adGroupType === 'near_employers' || adGroupType === 'distributed_focus') {
        keywordExamples.push(
          `business district ${location.city}`,
          `office nearby ${location.city}`,
          `downtown office ${location.city}`,
          `corporate housing ${location.city}`
        );
      }
      if (adGroupType === 'near_landmarks' || adGroupType === 'distributed_focus') {
        keywordExamples.push(
          `entertainment district ${location.city}`,
          `shopping ${location.city}`,
          `attractions ${location.city}`,
          `city center ${location.city}`
        );
      }
    }
    
    // Add brand voice modifiers
    const brandTone = clientProfile.brandVoice.tone;
    if (brandTone.includes('Luxury') || brandTone.includes('Premium')) {
      keywordExamples = keywordExamples.map(k => Math.random() > 0.7 ? `luxury ${k}` : k);
      specificNegatives.push('cheap', 'budget', 'affordable');
    }
    if (brandTone.includes('Modern') || brandTone.includes('Contemporary')) {
      keywordExamples = keywordExamples.map(k => Math.random() > 0.8 ? `modern ${k}` : k);
    }
    
    // Add general real estate terms
    const generalTerms = [
      `apartments ${location.city}`,
      `rent ${location.city}`,
      `housing ${location.city}`,
      `apartment rentals ${location.city}`,
      `${location.city} rentals`,
      `apartment homes ${location.city}`,
      `leasing ${location.city}`,
      `apartment complex ${location.city}`,
      `residential ${location.city}`,
      `community living ${location.city}`
    ];
    
    // Combine campaign-specific and general terms
    const allKeywords = [...keywordExamples, ...generalTerms].slice(0, 50);
    
    // Standard negatives for all campaigns
    const standardNegatives = ['buy', 'purchase', 'for sale', 'own', 'mortgage', 'financing'];
    const allNegatives = [...standardNegatives, ...specificNegatives].slice(0, 12);
    
    return `CAMPAIGN-SPECIFIC KEYWORD STRATEGY FOR ${campaignType.toUpperCase()} - ${adGroupType.toUpperCase()}:

KEYWORD EXAMPLES FOR THIS CAMPAIGN (Use as inspiration, adapt with your context):
${allKeywords.map(k => `• ${k}`).join('\n')}

NEGATIVE KEYWORDS FOR THIS CAMPAIGN:
${allNegatives.map(k => `• ${k}`).join('\n')}

KEYWORD GENERATION INSTRUCTIONS:
1. Generate 45-50 broad match keywords based on the examples above
2. Prioritize campaign-type specific terms (60% of keywords)
3. Include location variations: "${location.city} [keyword]", "[keyword] ${location.city}"
4. Add general real estate terms (40% of keywords)
5. Include brand voice modifiers when appropriate
6. Focus on search intent relevant to the campaign type
7. Generate 8-12 negative keywords to prevent irrelevant traffic`;
  }

  /**
   * Generate technical requirements section
   */
  private static generateTechnicalRequirements(request: RealEstateCampaignRequest): string {
    let requirements = `CHARACTER LIMITS (STRICTLY ENFORCED):

📏 HEADLINE RULES:
- MINIMUM: 20 characters
- MAXIMUM: 30 characters  
- COUNT: Exactly 15 headlines
- INCLUDE: Spaces, punctuation, everything

📏 DESCRIPTION RULES:
- MINIMUM: 65 characters
- MAXIMUM: 90 characters
- COUNT: Exactly 4 descriptions  
- INCLUDE: Spaces, punctuation, everything

💡 CHARACTER EXPANSION TIPS:
Headlines too short? Add: "Now", "Here", "Today", "Living", "Available"
Descriptions too short? Add: "with modern amenities", "in prime location", "available now"

KEYWORDS STRUCTURE:
- Broad Match: 45-50 highly targeted keywords based on campaign type and ad group
- Negative Keywords: 8-12 strategic exclusions

CAMPAIGN-SPECIFIC KEYWORD STRATEGY:

📍 GENERAL LOCATION CAMPAIGNS (re_general_location):
• Location General Focus: City name, "downtown", "urban living", "city apartments", "metro area", "[city] housing"
• Location Specific Focus: Neighborhood names, district names, "near [landmark]", "[neighborhood] apartments" 
• Location Amenities Focus: "walkable neighborhood", "transit accessible", "parks nearby", "restaurants walking distance"

🏠 UNIT TYPE CAMPAIGNS (re_unit_type):
• Studio Focus: "studio apartment", "efficiency", "compact living", "small space", "affordable studio", "downtown studio"
• 1BR Focus: "one bedroom", "1 bedroom apartment", "single bedroom", "1br", "couples apartment"
• 2BR Focus: "two bedroom", "2 bedroom apartment", "roommate friendly", "family apartment", "2br"
• 3BR Focus: "three bedroom", "family housing", "spacious apartment", "3 bedroom", "large apartment"
• 4BR+ Focus: "four bedroom", "large family", "luxury apartment", "spacious housing", "premium living"

🚶 PROXIMITY CAMPAIGNS (re_proximity):
• Near Schools: "student housing", "university apartments", "college housing", "campus living", "school nearby"
• Near Transit: "metro accessible", "train station", "bus line", "public transport", "commuter friendly"
• Near Employers: "business district", "office nearby", "work commute", "downtown office", "corporate housing"
• Near Landmarks: "entertainment district", "shopping nearby", "parks close", "attractions near", "city center"

KEYWORD GENERATION RULES:
1. Generate 45-50 broad match keywords total
2. 60% campaign-type specific, 40% general real estate terms
3. Include location variations: "[city] [keyword]", "[state] [keyword]"
4. Mix search intents: informational, navigational, transactional
5. Include modifier combinations: "luxury [keyword]", "affordable [keyword]", "new [keyword]"

NEGATIVE KEYWORD STRATEGY (8-12 terms):
• Always exclude: "buy", "purchase", "for sale", "own", "mortgage"
• Unit-specific exclusions: Opposite bedroom counts (if 1br campaign, exclude "studio", "2 bedroom")
• Budget exclusions: "cheap", "free" (for luxury properties)
• Competitor exclusions: Major competitor names
• Geographic exclusions: Competing cities/areas`;

    // Add distributed focus requirements for general location and proximity campaigns
    if (request.campaignType === 're_general_location' && (!request.adGroupType || request.adGroupType === 'distributed_focus')) {
      requirements += `

DISTRIBUTED HEADLINE REQUIREMENTS FOR GENERAL LOCATION CAMPAIGN:
- Distribute 15 headlines across these focuses (at least 1 headline per focus):
  * Location General: Broad city/area terms (5+ headlines)
  * Location Specific: Neighborhood/district specifics (5+ headlines)  
  * Location Amenities: Location + amenity combinations (5+ headlines)
- Each headline should represent one primary focus while maintaining variety
- Ensure comprehensive coverage across all three focus areas
- ALL headlines must still be 20-30 characters regardless of focus`;
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
- Use terms like "Near", "Close to", "Minutes from", "Walking distance"
- ALL headlines must still be 20-30 characters regardless of focus`;
    }

    requirements += `

🔍 MANDATORY CHARACTER VALIDATION PROCESS:
STEP 1: Write each headline
STEP 2: Count every character (including spaces)
STEP 3: If under 20 characters → ADD descriptive words
STEP 4: If over 30 characters → SHORTEN while keeping key message
STEP 5: Verify FINAL count before submitting

CHARACTER ENHANCEMENT STRATEGIES:
📝 HEADLINES (must reach 20+ chars):
  • Add location: "${request.location.city}", "${request.location.state}"
  • Add descriptors: "Luxury", "Modern", "Prime", "New", "Best"
  • Add urgency: "Tour Today", "Move-In Ready", "Available Now"
  • Add features: "Pool", "Garage", "Balcony", "Views"
  • Examples:
    ❌ "Downtown Apt" (12 chars) 
    ✅ "Luxury Downtown Apartment" (24 chars)
    ❌ "2BR Available" (13 chars)
    ✅ "2BR Luxury Apt Available" (24 chars)

📝 DESCRIPTIONS (must reach 65+ chars):
  • Include benefits: "luxury living", "modern amenities", "prime location"
  • Add features: "pool", "fitness center", "parking", "balcony"
  • Include calls-to-action: "Tour today", "Call now", "Apply online"
  • Add location benefits: "downtown", "near transit", "walkable"
  • Examples:
    ❌ "Great location with amenities!" (31 chars)
    ✅ "Discover luxury living in a prime downtown location with modern amenities and pool." (84 chars)

⚡ EFFICIENCY TIPS:
- Use abbreviations: "BR" for bedroom, "BA" for bathroom, "Apt" for apartment
- Leverage action words: "Tour", "Call", "Visit", "Apply", "Live", "Enjoy"
- Price indicators: "From $X", "Starting at", "Under $X", "Budget-friendly"
- Location shortcuts: "${request.location.city.length > 8 ? request.location.city.substring(0, 8) : request.location.city}", "${request.location.state}"`;

    return requirements;
  }

  /**
   * Generate output format section
   */
  private static generateOutputFormat(): string {
    return `FINAL REQUIREMENTS CHECK:

Before submitting, verify:
✓ 15 headlines, each 20-30 characters
✓ 4 descriptions, each 65-90 characters  
✓ Count includes ALL spaces and punctuation

REQUIRED JSON FORMAT:
{
  "headlines": [
    "Headline 1 (20-30 chars)",
    "Headline 2 (20-30 chars)",
    "... (13 more headlines)"
  ],
  "descriptions": [
    "Description 1 (65-90 chars)",
    "Description 2 (65-90 chars)",
    "Description 3 (65-90 chars)",
    "Description 4 (65-90 chars)"
  ],
  "keywords": {
    "broad_match": [
      "campaign specific keyword 1",
      "campaign specific keyword 2", 
      "location + keyword combination",
      "... (45-50 total broad match keywords)"
    ],
    "negative_keywords": [
      "buy",
      "purchase", 
      "for sale",
      "... (8-12 total negative keywords)"
    ]
  },
  "final_url_paths": ["suggested-path-1", "suggested-path-2", "suggested-path-3"]
}

Return ONLY valid JSON (no additional text).`;
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
    keywordStrategy: string;
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
${sections.keywordStrategy}

==================================================
${sections.exampleDrivenGuidance}

==================================================
${sections.technicalRequirements}

==================================================
${sections.outputFormat}`;
  }

  /**
   * Validate character counts for headlines and descriptions
   */
  private static validateCharacterCounts(headlines: string[], descriptions: string[]): {
    isValid: boolean;
    errors: string[];
    correctedHeadlines: string[];
    correctedDescriptions: string[];
  } {
    const errors: string[] = [];
    const correctedHeadlines: string[] = [];
    const correctedDescriptions: string[] = [];

    // Validate and correct headlines
    headlines.forEach((headline, index) => {
      if (headline.length < 20) {
        errors.push(`Headline ${index + 1}: "${headline}" (${headline.length} chars) is under 20 characters`);
        // Auto-correct by adding descriptive words
        const corrected = this.expandHeadline(headline);
        correctedHeadlines.push(corrected);
      } else if (headline.length > 30) {
        errors.push(`Headline ${index + 1}: "${headline}" (${headline.length} chars) is over 30 characters`);
        // Auto-correct by shortening
        const corrected = this.shortenHeadline(headline);
        correctedHeadlines.push(corrected);
      } else {
        correctedHeadlines.push(headline);
      }
    });

    // Validate and correct descriptions
    descriptions.forEach((description, index) => {
      if (description.length < 65) {
        errors.push(`Description ${index + 1}: "${description}" (${description.length} chars) is under 65 characters`);
        // Auto-correct by adding benefits
        const corrected = this.expandDescription(description);
        correctedDescriptions.push(corrected);
      } else if (description.length > 90) {
        errors.push(`Description ${index + 1}: "${description}" (${description.length} chars) is over 90 characters`);
        // Auto-correct by shortening
        const corrected = this.shortenDescription(description);
        correctedDescriptions.push(corrected);
      } else {
        correctedDescriptions.push(description);
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
      correctedHeadlines,
      correctedDescriptions
    };
  }

  /**
   * Expand headlines that are too short
   */
  private static expandHeadline(headline: string): string {
    const expansionWords = ['Now', 'Here', 'Today', 'Living', 'Life', 'Home', 'New', 'Prime', 'Best'];
    
    // Try adding words until we reach 20+ characters
    let expanded = headline;
    for (const word of expansionWords) {
      if (expanded.length >= 20) break;
      if (!expanded.includes(word)) {
        expanded = expanded.length + word.length + 1 <= 30 ? `${expanded} ${word}` : expanded;
      }
    }
    
    // If still too short, add "Available"
    if (expanded.length < 20 && expanded.length + 10 <= 30) {
      expanded = `${expanded} Available`;
    }
    
    return expanded.slice(0, 30); // Ensure we don't exceed 30
  }

  /**
   * Shorten headlines that are too long
   */
  private static shortenHeadline(headline: string): string {
    // Remove common filler words first
    const fillerWords = [' Available', ' Here', ' Now', ' Today', ' Daily'];
    let shortened = headline;
    
    for (const filler of fillerWords) {
      if (shortened.length <= 30) break;
      shortened = shortened.replace(filler, '');
    }
    
    // If still too long, truncate
    return shortened.length > 30 ? shortened.slice(0, 30).trim() : shortened;
  }

  /**
   * Expand descriptions that are too short
   */
  private static expandDescription(description: string): string {
    const expansionPhrases = [
      ' with modern amenities',
      ' and premium features',
      ' in a prime location',
      ' with excellent service',
      ' and community feel',
      ' available now'
    ];
    
    let expanded = description;
    for (const phrase of expansionPhrases) {
      if (expanded.length >= 65) break;
      if (expanded.length + phrase.length <= 90) {
        expanded = `${expanded}${phrase}`;
      }
    }
    
    return expanded;
  }

  /**
   * Shorten descriptions that are too long
   */
  private static shortenDescription(description: string): string {
    // Remove redundant words and phrases
    let shortened = description
      .replace(' and ', ' & ')
      .replace(' with ', ' w/ ')
      .replace('available ', '')
      .replace(' today', '')
      .replace(' now', '');
    
    // If still too long, truncate at word boundary
    if (shortened.length > 90) {
      const words = shortened.split(' ');
      while (words.join(' ').length > 90 && words.length > 5) {
        words.pop();
      }
      shortened = words.join(' ');
    }
    
    return shortened;
  }

  /**
   * Validate and correct AI-generated content to ensure character limits
   */
  static validateAndCorrectGeneratedContent(aiResponse: {
    headlines: string[];
    descriptions: string[];
    keywords?: any;
    final_url_paths?: string[];
  }): {
    headlines: string[];
    descriptions: string[];
    keywords?: any;
    final_url_paths?: string[];
    validationResults: {
      headlineErrors: string[];
      descriptionErrors: string[];
      correctionsMade: boolean;
    };
  } {
    const validation = this.validateCharacterCounts(aiResponse.headlines, aiResponse.descriptions);
    
    return {
      headlines: validation.correctedHeadlines,
      descriptions: validation.correctedDescriptions,
      keywords: aiResponse.keywords,
      final_url_paths: aiResponse.final_url_paths,
      validationResults: {
        headlineErrors: validation.errors.filter(e => e.includes('Headline')),
        descriptionErrors: validation.errors.filter(e => e.includes('Description')),
        correctionsMade: !validation.isValid
      }
    };
  }

  /**
   * Generate enhanced prompt with optimized character requirement focus
   */
  static generateOptimizedPrompt(
    request: RealEstateCampaignRequest,
    campaignContext: StructuredCampaignContext,
    clientProfile: StructuredClientProfile,
    brandVoiceValidation?: BrandVoiceValidationResult
  ): string {
    // Use the existing generateEnhancedPrompt but with a cleaner approach
    const basePrompt = this.generateEnhancedPrompt(request, campaignContext, clientProfile, brandVoiceValidation);
    
    // Add a focused character requirement reminder at the beginning
    const characterReminder = `CHARACTER REQUIREMENTS (CRITICAL):
• Headlines: 20-30 characters each (15 total)
• Descriptions: 65-90 characters each (4 total)
• Count all spaces and punctuation

`;
    
    return characterReminder + basePrompt;
  }
} 