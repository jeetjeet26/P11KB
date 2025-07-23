import { StructuredCampaignContext } from './CampaignContextBuilder';
import { StructuredClientProfile } from './ClientProfileManager';
import { BrandVoiceValidationResult } from '../validation/BrandVoiceValidator';
import { EnhancedContextBuilder, GeminiContext } from './CampaignContextBuilder';

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
  moveInDate?: string;
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
    const exampleSection = this.generateExampleDrivenGuidance(request, campaignContext, clientProfile);
    const technicalSection = this.generateTechnicalRequirements(request, clientProfile);
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
   * Generate example-driven guidance and template examples
   */
  private static generateExampleDrivenGuidance(
    request: RealEstateCampaignRequest,
    context: StructuredCampaignContext,
    clientProfile: StructuredClientProfile
  ): string {
    
    const examples = this.selectRelevantExamples(request, clientProfile, context);
    
    let section = `CREATIVE COMPOSITION GUIDANCE & EXAMPLES:`;

    section += `\n\nATOMIC INGREDIENT COMPOSITION STRATEGY:
The atomic ingredients in your context are designed to be combined creatively, not listed separately.
Think of them as building blocks for compelling ad copy.

COMPOSITION EXAMPLES:
• Amenity + Lifestyle: "Resort-style pool" + "Luxury living" → "Resort-style luxury awaits"
• Location + Feature: "Downtown location" + "In-unit laundry" → "Downtown convenience with in-unit laundry"  
• Community + Pricing: "The Heights" + "Starting at $1,200" → "The Heights starting at $1,200"
• Lifestyle + CTA: "Modern living" + "Tour today" → "Experience modern living - tour today"

 CREATIVE COMBINATION RULES:
 1. **Blend Categories**: Don't just pick one amenity - combine amenity + lifestyle + location for richer copy
 2. **Natural Language**: Make combinations flow naturally, not sound like a list
 3. **Campaign Focus**: Ensure all combinations support your ${context.campaignType.replace('re_', '').replace('_', ' ')} campaign focus
 4. **Character Efficiency**: Pack maximum value into minimum characters
 5. **Brand Voice**: All combinations must match the ${clientProfile.brandVoice.tone.join(', ')} tone`;

    // Add successful examples for additional inspiration
    if (examples.length > 0) {
      section += `\n\nSUCCESSFUL EXAMPLES FOR INSPIRATION:`;
      section += `\nUse these proven examples while adapting to your specific atomic ingredients:`;

      examples.forEach((example, index) => {
        section += `\n\nExample ${index + 1} (${example.context.brandVoiceTone.join(', ')} tone):`;
        section += `\nSample Headlines: ${example.headlines.slice(0, 3).join(' | ')}`;
        section += `\nSample Descriptions: ${example.descriptions.slice(0, 2).join(' | ')}`;
      });
    }

    section += `\n\nCREATIVE PROCESS:
1. **Inventory**: Review all available atomic ingredients in each category
2. **Select**: Choose 2-3 ingredients that work well together for each headline/description
3. **Combine**: Blend them into natural, compelling language 
4. **Validate**: Check character count and brand voice alignment
5. **Optimize**: Adjust for maximum impact within character limits

AVOID:
- Simply listing atomic ingredients: "Pool, gym, downtown" ❌
- Generic patterns: "Luxury apartments with amenities" ❌  
- Formulaic repetition: "Premium X, Premium Y, Premium Z" ❌

EMBRACE:
- Creative fusion: "Resort-style living in the heart of downtown" ✅
- Benefit-focused: "Wake up to luxury, walk to work" ✅
- Unique combinations: "Where modern meets convenience" ✅`;

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
          `3br apartment ${location.city}`,
          `family housing ${location.city}`,
          `spacious apartment ${location.city}`,
          `large apartment ${location.city}`
        );
        specificNegatives.push('studio', '1 bedroom', '2 bedroom');
      }
      else if (adGroupType === '4br_plus') {
        keywordExamples.push(
          `4 bedroom ${location.city}`,
          `4br apartment ${location.city}`,
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
  private static generateTechnicalRequirements(request: RealEstateCampaignRequest, clientProfile: StructuredClientProfile): string {
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

⚡ CRITICAL CHARACTER OPTIMIZATION:
FOR HEADLINES: ALWAYS use "BR" abbreviations - "1BR", "2BR", "3BR", "4BR" (saves 4-8 characters)
FOR DESCRIPTIONS: Can use either "bedroom" or "BR" as needed for character limits
Use abbreviations: "BR" for bedroom, "BA" for bathroom, "Apt" for apartment

📝 UNIT TYPE CAMPAIGNS (re_unit_type):
• 1BR Focus: "1br living", "1br apartment", "single bedroom", "couples apartment", "studio alternative"
• 2BR Focus: "2br living", "2br apartment", "roommate friendly", "family apartment", "spacious living"
• 3BR Focus: "3br living", "family housing", "spacious apartment", "large apartment", "family friendly"
• 4BR+ Focus: "4br living", "large family", "luxury apartment", "spacious housing", "premium living"

🚶 PROXIMITY CAMPAIGNS (re_proximity):
• Near Schools: "student housing", "university apartments", "college housing", "campus living", "school nearby"
• Near Transit: "metro accessible", "train station", "public transport", "commuter friendly"
• Near Employers: "business district", "office nearby", "downtown office", "corporate housing"
• Near Landmarks: "entertainment district", "shopping", "attractions", "city center"

📝 GENERAL LOCATION CAMPAIGNS (re_general_location):
• Location General: "downtown", "urban living", "metro", "city living"
• Location Specific: "neighborhood living", "historic district", "waterfront", "district apartments"
• Location Amenities: "walkable", "transit", "restaurants nearby", "parks near", "entertainment"

💡 BRAND VOICE TIPS:
• Luxury: "Exclusive", "Elevated", "Sophisticated", "Premium", "Refined"
• Friendly: "Welcoming", "Comfortable", "Warm", "Inviting", "Home"
• Modern: "Contemporary", "Sleek", "Smart", "Urban", "Tech-Enabled"
• Professional: "Quality", "Excellence", "Reliable", "Trusted", "Professional"
• Energetic: "Vibrant", "Dynamic", "Active", "Lively", "Exciting"

📝 GENERAL REAL ESTATE TERMS:
• Apartments, Rent, Housing, Apartment Rentals, Rentals, Apartment Homes, Leasing, Apartment Complex, Residential, Community Living

🚫 NEGATIVE KEYWORDS:
• Buy, Purchase, For Sale, Own, Mortgage, Financing

💡 COMBINATION TIPS:
• Blend Categories: Don't just pick one amenity - combine amenity + lifestyle + location for richer copy
• Natural Language: Make combinations flow naturally, not sound like a list
• Campaign Focus: Ensure all combinations support your ${request.campaignType.replace('re_', '').replace('_', ' ')} campaign focus
• Character Efficiency: Pack maximum value into minimum characters
• Brand Voice: All combinations must match the ${clientProfile.brandVoice.tone.join(', ')} tone

🚫 AVOID:
- Simply listing atomic ingredients: "Pool, gym, downtown" ❌
- Generic patterns: "Luxury apartments with amenities" ❌  
- Formulaic repetition: "Premium X, Premium Y, Premium Z" ❌

💚 EMBRACE:
- Creative fusion: "Resort-style living in the heart of downtown" ✅
- Benefit-focused: "Wake up to luxury, walk to work" ✅
- Unique combinations: "Where modern meets convenience" ✅`;

    return requirements;
  }



  /**
   * Generate output format section
   */
  private static generateOutputFormat(): string {
    return `OUTPUT FORMAT:
JSON STRUCTURED

📝 HEADLINE FORMAT:
{
  "headline": "Headline Text"
}

📝 DESCRIPTION FORMAT:
{
  "description": "Description Text"
}

📝 FINAL OUTPUT FORMAT:
{
  "headlines": [
    {
      "headline": "Headline 1"
    },
    {
      "headline": "Headline 2"
    },
    {
      "headline": "Headline 3"
    },
    {
      "headline": "Headline 4"
    },
    {
      "headline": "Headline 5"
    },
    {
      "headline": "Headline 6"
    },
    {
      "headline": "Headline 7"
    },
    {
      "headline": "Headline 8"
    },
    {
      "headline": "Headline 9"
    },
    {
      "headline": "Headline 10"
    },
    {
      "headline": "Headline 11"
    },
    {
      "headline": "Headline 12"
    },
    {
      "headline": "Headline 13"
    },
    {
      "headline": "Headline 14"
    },
    {
      "headline": "Headline 15"
    }
  ],
  "descriptions": [
    {
      "description": "Description 1"
    },
    {
      "description": "Description 2"
    },
    {
      "description": "Description 3"
    },
    {
      "description": "Description 4"
    }
  ]
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
   * Expand headlines that are too short with intelligent additions
   */
  private static expandHeadline(headline: string): string {
    if (headline.length >= 20) return headline;
    
    // Strategy 1: Add descriptive modifiers based on context
    const contextualModifiers = [
      { pattern: /apartment|apt/i, additions: ['Luxury', 'Modern', 'New'] },
      { pattern: /home|house/i, additions: ['Beautiful', 'Stunning', 'Prime'] },
      { pattern: /living/i, additions: ['Premium', 'Elegant', 'Stylish'] },
      { pattern: /pool|gym|fitness/i, additions: ['Resort-Style', 'Premium'] },
      { pattern: /location|downtown/i, additions: ['Prime', 'Central', 'Perfect'] }
    ];
    
    let expanded = headline;
    
    // Try contextual modifiers first
    for (const modifier of contextualModifiers) {
      if (expanded.length >= 20) break;
      if (modifier.pattern.test(expanded)) {
        for (const addition of modifier.additions) {
          if (expanded.length + addition.length + 1 <= 30 && !expanded.includes(addition)) {
            expanded = `${addition} ${expanded}`;
            break;
          }
        }
      }
    }
    
    // Strategy 2: Add location/availability terms if still short
    if (expanded.length < 20) {
      const genericAdditions = ['Available Now', 'Move-In Ready', 'Tour Today', 'Apply Now'];
      for (const addition of genericAdditions) {
        if (expanded.length + addition.length + 1 <= 30) {
          expanded = `${expanded} ${addition}`;
          break;
        }
      }
    }
    
    // Strategy 3: Add single impactful words if still short
    if (expanded.length < 20) {
      const impactWords = ['Today', 'Here', 'Now', 'Ready'];
      for (const word of impactWords) {
        if (expanded.length + word.length + 1 <= 30 && !expanded.includes(word)) {
          expanded = `${expanded} ${word}`;
          if (expanded.length >= 20) break;
        }
      }
    }
    
    return expanded.slice(0, 30);
  }

  /**
   * Intelligently shorten headlines while preserving meaning and readability
   */
  private static shortenHeadline(headline: string): string {
    if (headline.length <= 30) return headline;
    
    let shortened = headline.trim();
    
    // Strategy 1: Common abbreviations that preserve meaning
    const abbreviations = [
      { full: ' Avenue', short: ' Ave' },
      { full: ' Street', short: ' St' },
      { full: ' Boulevard', short: ' Blvd' },
      { full: ' Apartment', short: ' Apt' },
      { full: ' Apartments', short: ' Apts' },
      { full: ' Community', short: '' },
      { full: ' Properties', short: '' },
      { full: ' Residences', short: '' },
      { full: ' and ', short: ' & ' },
      { full: ' with ', short: ' w/ ' },
      { full: ' Available', short: '' },
      { full: ' Now Available', short: '' }
    ];
    
    for (const abbrev of abbreviations) {
      if (shortened.length <= 30) break;
      shortened = shortened.replace(new RegExp(abbrev.full, 'gi'), abbrev.short);
    }
    
    // Strategy 2: Remove less important modifiers while keeping core message
    if (shortened.length > 30) {
      const fillerWords = [
        ' Available', ' Here', ' Now', ' Today', ' Ready',
        ' Beautiful', ' Stunning', ' Amazing', ' Incredible',
        ' Perfect', ' Great', ' Excellent', ' Outstanding',
        ' Brand New', ' Newly', ' Recently'
      ];
      
      for (const filler of fillerWords) {
        if (shortened.length <= 30) break;
        shortened = shortened.replace(new RegExp(filler, 'gi'), '');
      }
    }
    
    // Strategy 3: Smart word removal (remove less critical words)
    if (shortened.length > 30) {
      const words = shortened.split(' ');
      const lowPriorityWords = ['the', 'a', 'an', 'very', 'really', 'quite', 'just', 'only'];
      
      // Remove low priority words first
      const filteredWords = words.filter(word => 
        !lowPriorityWords.includes(word.toLowerCase()) || words.length <= 3
      );
      
      if (filteredWords.join(' ').length <= 30) {
        shortened = filteredWords.join(' ');
      }
    }
    
    // Strategy 4: Intelligent truncation at word boundaries
    if (shortened.length > 30) {
      const words = shortened.split(' ');
      let result = '';
      
      for (const word of words) {
        const testLength = result ? result.length + 1 + word.length : word.length;
        if (testLength <= 30) {
          result = result ? `${result} ${word}` : word;
        } else {
          break;
        }
      }
      
      shortened = result || shortened.slice(0, 27) + '...';
    }
    
    return shortened.trim();
  }

  /**
   * Intelligently expand descriptions that are too short
   */
  private static expandDescription(description: string): string {
    if (description.length >= 65) return description;
    
    let expanded = description.trim();
    
    // Strategy 1: Add contextual benefits based on content
    const contextualExpansions = [
      { 
        pattern: /pool/i, 
        additions: [' with cabanas and lounging areas', ' featuring modern design', ' perfect for relaxation'] 
      },
      { 
        pattern: /gym|fitness/i, 
        additions: [' with state-of-the-art equipment', ' featuring modern cardio and weights', ' open 24/7 for convenience'] 
      },
      { 
        pattern: /apartment|unit/i, 
        additions: [' featuring modern finishes', ' with premium amenities included', ' designed for comfortable living'] 
      },
      { 
        pattern: /location/i, 
        additions: [' with easy access to shopping and dining', ' near major transportation routes', ' in a vibrant neighborhood'] 
      }
    ];
    
    // Try contextual expansions first
    for (const expansion of contextualExpansions) {
      if (expanded.length >= 65) break;
      if (expansion.pattern.test(expanded)) {
        for (const addition of expansion.additions) {
          if (expanded.length + addition.length <= 90) {
            expanded = `${expanded}${addition}`;
            break;
          }
        }
      }
    }
    
    // Strategy 2: Add generic quality indicators if still short
    if (expanded.length < 65) {
      const qualityAdditions = [
        ' with premium features',
        ' and modern conveniences',
        ' featuring quality craftsmanship',
        ' in an exceptional community',
        ' with professional management'
      ];
      
      for (const addition of qualityAdditions) {
        if (expanded.length + addition.length <= 90) {
          expanded = `${expanded}${addition}`;
          if (expanded.length >= 65) break;
        }
      }
    }
    
    // Strategy 3: Add availability/action phrases if still short
    if (expanded.length < 65) {
      const actionPhrases = [' available now', ' ready for move-in', ' schedule your tour today'];
      for (const phrase of actionPhrases) {
        if (expanded.length + phrase.length <= 90) {
          expanded = `${expanded}${phrase}`;
          break;
        }
      }
    }
    
    return expanded.slice(0, 90);
  }

  /**
   * Intelligently shorten descriptions while preserving marketing impact
   */
  private static shortenDescription(description: string): string {
    if (description.length <= 90) return description;
    
    let shortened = description.trim();
    
    // Strategy 1: Replace verbose phrases with concise alternatives
    const replacements = [
      { verbose: ' featuring ', concise: ' with ' },
      { verbose: ' including ', concise: ' with ' },
      { verbose: ' available ', concise: ' ' },
      { verbose: ' and more', concise: '' },
      { verbose: ' plus ', concise: ' & ' },
      { verbose: ' as well as ', concise: ' & ' },
      { verbose: ' in addition to ', concise: ' & ' },
      { verbose: ' state-of-the-art ', concise: ' modern ' },
      { verbose: ' high-quality ', concise: ' quality ' },
      { verbose: ' exceptional ', concise: ' great ' }
    ];
    
    for (const replacement of replacements) {
      if (shortened.length <= 90) break;
      shortened = shortened.replace(new RegExp(replacement.verbose, 'gi'), replacement.concise);
    }
    
    // Strategy 2: Remove redundant adjectives
    if (shortened.length > 90) {
      const redundantPatterns = [
        / (beautiful|stunning|amazing|incredible) and (gorgeous|lovely|wonderful)/gi,
        / (modern|contemporary) and (updated|new|fresh)/gi,
        / (spacious|large|roomy) and (comfortable|cozy)/gi
      ];
      
      redundantPatterns.forEach(pattern => {
        shortened = shortened.replace(pattern, (match) => {
          const words = match.trim().split(' and ');
          return ` ${words[0].trim()}`;
        });
      });
    }
    
    // Strategy 3: Smart sentence truncation at natural breaks
    if (shortened.length > 90) {
      const sentences = shortened.split(/[.!?]/).filter(s => s.trim());
      let result = '';
      
      for (const sentence of sentences) {
        const testLength = result ? result.length + sentence.trim().length + 2 : sentence.trim().length;
        if (testLength <= 88) { // Leave room for punctuation
          result = result ? `${result}. ${sentence.trim()}` : sentence.trim();
        } else {
          break;
        }
      }
      
      if (result && result.length <= 90) {
        shortened = result + (result.endsWith('.') ? '' : '.');
      }
    }
    
    // Strategy 4: Word-boundary truncation as last resort
    if (shortened.length > 90) {
      const words = shortened.split(' ');
      let result = '';
      
      for (const word of words) {
        const testLength = result ? result.length + 1 + word.length : word.length;
        if (testLength <= 87) { // Leave room for "..."
          result = result ? `${result} ${word}` : word;
        } else {
          break;
        }
      }
      
      shortened = result ? `${result}...` : shortened.slice(0, 87) + '...';
    }
    
    return shortened.trim();
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

  /**
   * Generate enhanced prompt using dual chunking system (Phase 2)
   */
  static async generateDualChunkingPrompt(
    request: RealEstateCampaignRequest,
    campaignContext: StructuredCampaignContext,
    clientProfile: StructuredClientProfile,
    brandVoiceValidation?: BrandVoiceValidationResult
  ): Promise<string> {
    
    // Determine campaign focus from request and context
    const campaignFocus = EnhancedContextBuilder.determineCampaignFocus(
      request.campaignType, 
      request.adGroupType
    );
    
    // Get community name from client profile or extract from request
    const communityName = clientProfile.property.communityName || 
      request.additionalContext || 
      'Auto-Extract';
    
    console.log(`[DUAL_CHUNKING_PROMPT] Building prompt with dual chunking for ${communityName}, focus: ${campaignFocus}`);
    
    // Build organized Gemini context using dual chunking
    const geminiContext = await EnhancedContextBuilder.buildGeminiContext(
      communityName,
      campaignFocus,
      request.clientId
    );
    
    // Generate base prompt using existing enhanced prompt structure
    const basePrompt = this.generateEnhancedPrompt(request, campaignContext, clientProfile, brandVoiceValidation);
    
    // Enhance the prompt with organized dual chunking context
    const enhancedPrompt = this.buildDualChunkingEnhancedPrompt(
      basePrompt,
      geminiContext,
      request,
      campaignContext,
      clientProfile
    );
    
    console.log(`[DUAL_CHUNKING_PROMPT] Generated enhanced prompt with ${Object.values(geminiContext.atomicIngredients).flat().length} atomic ingredients and ${geminiContext.narrativeContext.length} narrative chunks`);
    
    return enhancedPrompt;
  }
  
  /**
   * Build enhanced prompt structure with dual chunking context
   */
  private static buildDualChunkingEnhancedPrompt(
    basePrompt: string,
    geminiContext: GeminiContext,
    request: RealEstateCampaignRequest,
    campaignContext: StructuredCampaignContext,
    clientProfile: StructuredClientProfile
  ): string {
    
    // Count total atomic ingredients
    const atomicCounts = Object.entries(geminiContext.atomicIngredients).map(([key, values]) => 
      `${key}: ${(values as string[]).length}`
    ).join(', ');
    
    // Build enhanced context section for dual chunking
    const dualChunkingSection = `
==================================================
ENHANCED DUAL CHUNKING CONTEXT (PHASE 2)

🧩 ATOMIC INGREDIENTS AVAILABLE (${Object.values(geminiContext.atomicIngredients).flat().length} total):
${atomicCounts}

ATOMIC AMENITIES (${geminiContext.atomicIngredients.amenities.length}):
${geminiContext.atomicIngredients.amenities.length > 0 ? geminiContext.atomicIngredients.amenities.map((a: string) => `• ${a}`).join('\n') : '• None available - create compelling amenity descriptions'}

ATOMIC FEATURES (${geminiContext.atomicIngredients.features.length}):
${geminiContext.atomicIngredients.features.length > 0 ? geminiContext.atomicIngredients.features.map((f: string) => `• ${f}`).join('\n') : '• None available - focus on general apartment features'}

ATOMIC LOCATION BENEFITS (${geminiContext.atomicIngredients.location.length}):
${geminiContext.atomicIngredients.location.length > 0 ? geminiContext.atomicIngredients.location.map((l: string) => `• ${l}`).join('\n') : '• None available - use general location context'}

ATOMIC PRICING ELEMENTS (${geminiContext.atomicIngredients.pricing.length}):
${geminiContext.atomicIngredients.pricing.length > 0 ? geminiContext.atomicIngredients.pricing.map((p: string) => `• ${p}`).join('\n') : '• None available - focus on value proposition'}

ATOMIC LIFESTYLE DESCRIPTORS (${geminiContext.atomicIngredients.lifestyle.length}):
${geminiContext.atomicIngredients.lifestyle.length > 0 ? geminiContext.atomicIngredients.lifestyle.map((l: string) => `• ${l}`).join('\n') : '• None available - create lifestyle appeal'}

ATOMIC COMMUNITY BRANDING (${geminiContext.atomicIngredients.community.length}):
${geminiContext.atomicIngredients.community.length > 0 ? geminiContext.atomicIngredients.community.map((c: string) => `• ${c}`).join('\n') : '• None available - use general community appeal'}

ATOMIC CALL-TO-ACTION OPTIONS (${geminiContext.atomicIngredients.cta.length}):
${geminiContext.atomicIngredients.cta.length > 0 ? geminiContext.atomicIngredients.cta.map((c: string) => `• ${c}`).join('\n') : '• Tour today • Apply now • Call now • Schedule visit'}

ATOMIC URGENCY ELEMENTS (${geminiContext.atomicIngredients.urgency.length}):
${geminiContext.atomicIngredients.urgency.length > 0 ? geminiContext.atomicIngredients.urgency.map((u: string) => `• ${u}`).join('\n') : '• None available - create appropriate urgency if needed'}

📖 NARRATIVE CONTEXT CHUNKS (${geminiContext.narrativeContext.length} chunks):
${geminiContext.narrativeContext.length > 0 ? 
  geminiContext.narrativeContext.map((narrative: string, index: number) => 
    `\nNARRATIVE ${index + 1}:\n${narrative}`
  ).join('\n') : 
  '\nNo narrative context available - rely on atomic ingredients and general property knowledge'
}

🎯 CAMPAIGN FOCUS: ${geminiContext.campaignFocus.toUpperCase()}
Campaign focus determines which atomic ingredients and narrative chunks are most relevant.

💡 DUAL CHUNKING INSTRUCTIONS:
1. **ATOMIC INGREDIENT USAGE**: Combine atomic ingredients creatively across categories
   - Mix amenities + lifestyle for compelling value propositions
   - Combine location + pricing for competitive positioning  
   - Use community + features for brand differentiation
   - Integrate CTA + urgency for compelling actions

2. **NARRATIVE CONTEXT INTEGRATION**: Use narrative chunks for broader storytelling
   - Reference narrative context for positioning and tone
   - Use atomic ingredients as specific details within narrative themes
   - Maintain consistency between atomic precision and narrative flow

3. **CREATIVE COMBINATION STRATEGY**:
   - Don't just list atomic ingredients - combine them meaningfully
   - "Resort-style pool" + "Luxury living" + "Downtown location" = "Resort-style luxury in the heart of downtown"
   - "In-unit laundry" + "Modern features" + "Convenience" = "Modern convenience with in-unit laundry"

4. **FOCUS ALIGNMENT**: Ensure ${geminiContext.campaignFocus} remains the primary theme throughout all copy

==================================================`;

    // Insert the dual chunking section after the role definition but before the campaign brief
    const roleSectionEnd = basePrompt.indexOf('==================================================');
    if (roleSectionEnd !== -1) {
      const beforeRole = basePrompt.substring(0, roleSectionEnd);
      const afterRole = basePrompt.substring(roleSectionEnd);
      return beforeRole + dualChunkingSection + '\n' + afterRole;
    } else {
      // Fallback: prepend to the beginning
      return dualChunkingSection + '\n\n' + basePrompt;
    }
  }
}