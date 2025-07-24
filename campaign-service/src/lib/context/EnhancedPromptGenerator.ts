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
        headlines: [
          'Luxury Apts at Riverside', // 25 chars, community name, abbreviation
          'Downtown Riverside Living', // 25 chars, location + community
          'Riverside Pool & Spa Access', // 27 chars, community + amenity
          'Premium Riverside Lifestyle', // 27 chars, community + lifestyle
          'Modern Apts w/ Rooftop Views' // 28 chars, abbreviation + feature
        ],
        descriptions: [
          'Experience resort-style amenities at Riverside with luxury finishes included.', // 79 chars
          'Your downtown oasis awaits at Riverside - premium location with modern style.', // 79 chars
          'Discover Riverside living with rooftop pool, fitness center, and city views.', // 77 chars
          'Premium apartments at Riverside featuring in-unit laundry and smart home tech.' // 80 chars
        ],
        context: {
          campaignType: 're_general_location',
          adGroupType: 'location_general',
          brandVoiceTone: ['Modern', 'Sophisticated'],
          targetDemographic: 'Young professionals',
          priceRange: 'Premium'
        }
      },
      {
        headlines: [
          'The Heights Family Living', // 25 chars, community name
          'Spacious 2BRs at Heights', // 24 chars, unit type + community + abbreviation
          'Heights School District', // 22 chars, community + benefit
          'Family Haven at Heights', // 23 chars, demographic + community
          'Heights Playground Access' // 25 chars, community + family amenity
        ],
        descriptions: [
          'Family-friendly Heights community with playground, pool, and top-rated schools.', // 79 chars
          'Discover The Heights - spacious apartments with family amenities and safe streets.', // 83 chars
          'Welcome home to The Heights where families thrive with resort-style amenities.', // 78 chars
          'The Heights offers 2BR and 3BR apartments with family-focused community features.' // 80 chars
        ],
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
        headlines: [
          'Luxury 1BR Starting $1,800', // 27 chars, unit type + pricing
          'Modern 1BR w/ City Views', // 24 chars, unit type + feature
          '1BR Apts - Move In Ready', // 24 chars, unit type + urgency
          'Spacious 1BR Living Now', // 23 chars, unit type + availability
          'Premium 1BR w/ Balcony' // 22 chars, unit type + feature
        ],
        descriptions: [
          'Sophisticated 1-bedroom apartments with in-unit laundry and luxury finishes.', // 77 chars
          'Your perfect 1BR features modern kitchen, spa bath, and premium amenities.', // 75 chars
          'Discover 1-bedroom living with resort-style pool and rooftop social spaces.', // 76 chars
          'Premium 1BR apartments featuring smart home technology and city views available.' // 79 chars
        ],
        context: {
          campaignType: 're_unit_type',
          adGroupType: '1br',
          brandVoiceTone: ['Efficient', 'Smart'],
          targetDemographic: 'Young professionals',
          priceRange: 'Premium'
        }
      },
      {
        headlines: [
          'Spacious 2BR w/ Office', // 22 chars, unit type + feature
          '2BR Family Apts Ready', // 21 chars, unit type + demographic
          'Perfect 2BR for Roomies', // 23 chars, unit type + demographic
          '2BRs w/ In-Unit Laundry', // 23 chars, unit type + feature
          'Modern 2BR Starting $2,400' // 26 chars, unit type + pricing
        ],
        descriptions: [
          'Spacious 2-bedroom apartments perfect for families with modern amenities included.', // 82 chars
          'Your ideal 2BR home features open layouts, premium finishes, and pool access.', // 78 chars
          'Discover 2-bedroom living with in-unit laundry and resort-style amenities.', // 75 chars
          'Premium 2BR apartments featuring modern kitchens and luxury bathroom finishes.' // 78 chars
        ],
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
        headlines: [
          'Walk to Harvard Daily', // 21 chars - Step 2: lifestyle transformation
          'Skip Commute to MIT', // 19 chars - Step 3: convenience as luxury  
          'Campus Life at Door', // 19 chars - Step 3: proximity as premium
          'Study at Home Base', // 18 chars - lifestyle benefit focus
          'University District Living' // 26 chars - prestigious location appeal
        ],
        descriptions: [
          'Transform your daily routine with a 3-minute walk to Harvard campus from home.', // 78 chars
          'Skip traffic stress and live steps from MIT with modern student amenities.', // 74 chars  
          'Your prestigious university district home with study spaces and quick campus access.', // 85 chars
          'Premium student living in the heart of the university district with modern conveniences.' // 89 chars
        ],
        context: {
          campaignType: 're_proximity',
          adGroupType: 'near_schools',
          brandVoiceTone: ['Sophisticated', 'Convenient'],
          targetDemographic: 'Students',
          priceRange: 'Premium university housing'
        }
      },
      {
        headlines: [
          'Coffee Shop Lifestyle', // 21 chars - Step 3: convenience as lifestyle
          'Skip Commute Stress', // 19 chars - Step 3: time-saving benefit
          'Walk to Work Daily', // 18 chars - Step 2: routine transformation
          'Everything Walkable', // 19 chars - Step 3: accessibility premium
          'Downtown at Doorstep' // 20 chars - Step 3: location as luxury
        ],
        descriptions: [
          'Experience the coffee shop lifestyle with downtown cafes and offices at your door.', // 83 chars
          'Skip the commute stress and walk to work from your downtown luxury apartment home.', // 82 chars
          'Your walkable lifestyle awaits with restaurants, offices, and entertainment nearby.', // 83 chars
          'Premium downtown living where everything you need is within a comfortable walk.' // 77 chars
        ],
        context: {
          campaignType: 're_proximity',
          adGroupType: 'near_employers',
          brandVoiceTone: ['Modern', 'Sophisticated'],
          targetDemographic: 'Young professionals',
          priceRange: 'Premium downtown'
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
    
    let section = `CREATIVE COMPOSITION MASTERY & CHARACTER-SMART EXAMPLES:`;

    section += `\n\nATOMIC INGREDIENT FUSION STRATEGY:
Master the art of blending atomic ingredients into compelling narratives that naturally fit Google Ads' optimal character ranges. The best ad copy doesn't just list features - it weaves them into irresistible stories.

CHARACTER-OPTIMIZED COMPOSITION EXAMPLES:
• Amenity + Lifestyle: "Resort-style pool" + "Luxury living" → "Resort-style luxury awaits" (26 chars - perfect headline length)
• Location + Feature: "Downtown location" + "In-unit laundry" → "Downtown w/ in-unit laundry" (28 chars - using smart abbreviation)  
• Community + Pricing: "The Heights" + "Starting at $1,200" → "Heights Apts from $1,200" (23 chars - community name + abbreviation)
• Lifestyle + CTA: "Modern living" + "Tour today" → "Modern living tours today" (24 chars - action-oriented)

✨ CHARACTER-SMART COMPOSITION MASTERY:
 1. **Strategic Abbreviations**: Use "Apts", "BR", "w/" naturally to create space for compelling benefits
 2. **Power Words**: Choose words that pack emotional punch: "luxury" vs "nice", "resort-style" vs "good"
 3. **Natural Flow**: Make abbreviations feel intentional, not cramped - "Luxury Apts at Riverside" flows beautifully
 4. **Campaign Alignment**: Every combination should advance your ${context.campaignType.replace('re_', '').replace('_', ' ')} campaign story
 5. **Brand Voice Excellence**: All combinations must authentically express the ${clientProfile.brandVoice.tone.join(' & ')} personality`;

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

    section += `\n\nMASTERFUL CREATIVE WORKFLOW:
🧠 **Creative Discovery**: Explore your atomic ingredients like a storyteller finding the perfect narrative elements
✨ **Strategic Selection**: Choose 2-3 ingredients that naturally enhance each other and fit your character sweet spot
🎨 **Seamless Fusion**: Weave ingredients into compelling narratives that feel effortless and natural
🎯 **Brand Alignment**: Ensure every creation authentically expresses your ${clientProfile.brandVoice.tone.join(' & ')} personality
⚡ **Impact Optimization**: Fine-tune for maximum emotional resonance within optimal character ranges

TRANSFORMATION EXAMPLES:
❌ **Avoid Ingredient Lists**: "Pool, gym, downtown location" (feels mechanical)
✅ **Create Story Elements**: "Resort-style living in the heart of downtown" (feels aspirational)

❌ **Avoid Generic Templates**: "Luxury apartments with amenities" (could be anywhere)
✅ **Create Unique Narratives**: "Wake up to luxury, walk to work" (specific lifestyle story)

❌ **Avoid Formulaic Repetition**: "Premium X, Premium Y, Premium Z" (predictable pattern)
✅ **Create Varied Excellence**: "Where modern meets convenience" (fresh perspective)

The goal is making every headline and description feel like it was crafted specifically for someone who would love living at your property.`;

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
          `city living ${location.city}`,
          `${location.city} rentals`,
          `${location.city} apartment complex`,
          `${location.city} residential`,
          `${location.city} homes for rent`
        );
      }
      if (adGroupType === 'location_specific' || adGroupType === 'distributed_focus') {
        keywordExamples.push(
          `${location.city} downtown apartments`,
          `${location.city} neighborhood living`,
          `historic district ${location.city}`,
          `waterfront ${location.city}`,
          `${location.city} district apartments`,
          `${location.city} uptown`,
          `${location.city} midtown`,
          `${location.city} suburbs`,
          `${location.city} central`,
          `${location.city} east side`,
          `${location.city} west side`
        );
      }
      if (adGroupType === 'location_amenities' || adGroupType === 'distributed_focus') {
        keywordExamples.push(
          `walkable ${location.city}`,
          `${location.city} transit`,
          `${location.city} restaurants nearby`,
          `parks near ${location.city}`,
          `${location.city} entertainment`,
          `${location.city} shopping`,
          `${location.city} nightlife`,
          `${location.city} fitness centers`,
          `${location.city} grocery stores`,
          `${location.city} public transport`
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
          `affordable studio ${location.city}`,
          `studio loft ${location.city}`,
          `studio flat ${location.city}`,
          `efficiency apartment ${location.city}`,
          `micro apartment ${location.city}`,
          `studio rental ${location.city}`,
          `studio living ${location.city}`
        );
        specificNegatives.push('1 bedroom', '2 bedroom', '3 bedroom', 'family', 'large apartment');
      }
      else if (adGroupType === '1br') {
        keywordExamples.push(
          `1 bedroom ${location.city}`,
          `one bedroom ${location.city}`,
          `1br apartment ${location.city}`,
          `single bedroom ${location.city}`,
          `couples apartment ${location.city}`,
          `1 bed ${location.city}`,
          `one bed ${location.city}`,
          `1 bedroom rental ${location.city}`,
          `1 bedroom living ${location.city}`,
          `1 bedroom flat ${location.city}`,
          `1 bedroom unit ${location.city}`,
          `1 bedroom home ${location.city}`
        );
        specificNegatives.push('studio', '2 bedroom', '3 bedroom', 'efficiency');
      }
      else if (adGroupType === '2br') {
        keywordExamples.push(
          `2 bedroom ${location.city}`,
          `two bedroom ${location.city}`,
          `2br apartment ${location.city}`,
          `roommate ${location.city}`,
          `family apartment ${location.city}`,
          `2 bed ${location.city}`,
          `two bed ${location.city}`,
          `2 bedroom rental ${location.city}`,
          `2 bedroom living ${location.city}`,
          `2 bedroom flat ${location.city}`,
          `2 bedroom unit ${location.city}`,
          `2 bedroom home ${location.city}`,
          `roommate friendly ${location.city}`
        );
        specificNegatives.push('studio', '1 bedroom', '3 bedroom', 'efficiency');
      }
      else if (adGroupType === '3br') {
        keywordExamples.push(
          `3 bedroom ${location.city}`,
          `three bedroom ${location.city}`,
          `3br apartment ${location.city}`,
          `family housing ${location.city}`,
          `spacious apartment ${location.city}`,
          `large apartment ${location.city}`,
          `3 bed ${location.city}`,
          `three bed ${location.city}`,
          `3 bedroom rental ${location.city}`,
          `3 bedroom living ${location.city}`,
          `3 bedroom flat ${location.city}`,
          `3 bedroom unit ${location.city}`,
          `3 bedroom home ${location.city}`
        );
        specificNegatives.push('studio', '1 bedroom', '2 bedroom', 'efficiency');
      }
      else if (adGroupType === '4br_plus') {
        keywordExamples.push(
          `4 bedroom ${location.city}`,
          `4br apartment ${location.city}`,
          `large family ${location.city}`,
          `luxury apartment ${location.city}`,
          `spacious housing ${location.city}`,
          `premium living ${location.city}`,
          `4 bed ${location.city}`,
          `four bedroom ${location.city}`,
          `4 bedroom rental ${location.city}`,
          `4 bedroom living ${location.city}`,
          `4 bedroom flat ${location.city}`,
          `4 bedroom unit ${location.city}`,
          `large home ${location.city}`
        );
        specificNegatives.push('studio', '1 bedroom', '2 bedroom', '3 bedroom', 'efficiency');
      }
    }
    
    else if (campaignType === 're_proximity') {
      if (request.proximityTargets?.length) {
        request.proximityTargets.forEach(target => {
          keywordExamples.push(
            `near ${target}`,
            `close to ${target}`,
            `${target} nearby`,
            `walking distance ${target}`,
            `${target} proximity`,
            `next to ${target}`
          );
        });
      }
      
      if (adGroupType === 'near_schools' || adGroupType === 'distributed_focus') {
        keywordExamples.push(
          `student housing ${location.city}`,
          `university apartments ${location.city}`,
          `college housing ${location.city}`,
          `campus living ${location.city}`,
          `school district ${location.city}`,
          `near campus ${location.city}`,
          `student rentals ${location.city}`,
          `academic housing ${location.city}`
        );
      }
      if (adGroupType === 'near_transit' || adGroupType === 'distributed_focus') {
        keywordExamples.push(
          `metro accessible ${location.city}`,
          `train station ${location.city}`,
          `public transport ${location.city}`,
          `commuter friendly ${location.city}`,
          `subway ${location.city}`,
          `bus line ${location.city}`,
          `transit oriented ${location.city}`,
          `transportation hub ${location.city}`
        );
      }
      if (adGroupType === 'near_employers' || adGroupType === 'distributed_focus') {
        keywordExamples.push(
          `business district ${location.city}`,
          `office nearby ${location.city}`,
          `downtown office ${location.city}`,
          `corporate housing ${location.city}`,
          `financial district ${location.city}`,
          `tech corridor ${location.city}`,
          `business center ${location.city}`,
          `commercial area ${location.city}`
        );
      }
      if (adGroupType === 'near_landmarks' || adGroupType === 'distributed_focus') {
        keywordExamples.push(
          `entertainment district ${location.city}`,
          `shopping ${location.city}`,
          `attractions ${location.city}`,
          `city center ${location.city}`,
          `historic area ${location.city}`,
          `cultural district ${location.city}`,
          `tourist area ${location.city}`,
          `landmark vicinity ${location.city}`
        );
      }
    }
    
    // Add brand voice modifiers
    const brandTone = clientProfile.brandVoice.tone;
    if (brandTone.includes('Luxury') || brandTone.includes('Premium')) {
      keywordExamples = keywordExamples.map(k => Math.random() > 0.7 ? `luxury ${k}` : k);
      keywordExamples.push(`luxury living ${location.city}`, `premium apartments ${location.city}`, `upscale ${location.city}`, `high end ${location.city}`);
      specificNegatives.push('cheap', 'budget', 'affordable', 'low income');
    }
    if (brandTone.includes('Modern') || brandTone.includes('Contemporary')) {
      keywordExamples = keywordExamples.map(k => Math.random() > 0.8 ? `modern ${k}` : k);
      keywordExamples.push(`modern living ${location.city}`, `contemporary apartments ${location.city}`, `new construction ${location.city}`);
    }
    
    // Add extensive general real estate terms
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
      `community living ${location.city}`,
      `apartment living ${location.city}`,
      `rental property ${location.city}`,
      `multifamily ${location.city}`,
      `apartment search ${location.city}`,
      `rental homes ${location.city}`,
      `apartment finder ${location.city}`,
      `rental community ${location.city}`,
      `luxury apartments ${location.city}`,
      `pet friendly ${location.city}`,
      `furnished apartments ${location.city}`,
      `short term rentals ${location.city}`,
      `lease ${location.city}`,
      `renting ${location.city}`,
      `tenant ${location.city}`,
      `apartment amenities ${location.city}`,
      `gated community ${location.city}`,
      `resort style ${location.city}`,
      `pool apartments ${location.city}`,
      `fitness center ${location.city}`,
      `parking included ${location.city}`,
      `utilities included ${location.city}`,
      `in unit laundry ${location.city}`,
      `balcony ${location.city}`,
      `hardwood floors ${location.city}`,
      `granite counters ${location.city}`,
      `stainless appliances ${location.city}`
    ];
    
    // Combine all keywords and ensure we have enough
    const allKeywords = [...keywordExamples, ...generalTerms].slice(0, 60); // Target ~40-50 broad match
    
    // Comprehensive negative keywords to protect traffic quality
    const standardNegatives = ['buy', 'purchase', 'for sale', 'own', 'mortgage', 'financing', 'loan', 'down payment', 'equity', 'investment property', 'flip', 'wholesale'];
    const qualityNegatives = ['free', 'homeless', 'shelter', 'section 8', 'welfare', 'subsidized', 'government', 'low income housing'];
    const competitorNegatives = ['hotel', 'motel', 'vacation rental', 'airbnb', 'extended stay', 'temporary'];
    const allNegatives = [...standardNegatives, ...qualityNegatives, ...competitorNegatives, ...specificNegatives].slice(0, 20); // Target ~15-20 negative
    
    return `🎯 STRATEGIC KEYWORD INTELLIGENCE for ${campaignType.replace('re_', '').replace('_', ' ')} Campaign:

Your keyword strategy should naturally align with the search behavior of prospects looking for exactly what you're offering. **Generate 50-80 total keywords: 40-60 broad match keywords + 15-20 negative keywords.** Use these proven keyword patterns as inspiration to create your customized set.

**CRITICAL: You must return a populated 'keywords' object with broad_match and negative_keywords arrays in your JSON response.**

PROVEN BROAD MATCH PATTERNS (Expand these concepts with related variations):
${allKeywords.map(k => `• ${k}`).join('\n')}

TRAFFIC QUALITY PROTECTORS (Negative keywords to maintain campaign focus):
${allNegatives.map(k => `• ${k}`).join('\n')}

KEYWORD VOLUME TARGET:
• **Broad Match Keywords: 40-60 keywords** - Cast a wide net for discovery while maintaining relevance
• **Negative Keywords: 15-20 keywords** - Protect against irrelevant traffic and maintain quality

KEYWORD CRAFTING MASTERY:
🎯 **Strategic Foundation**: Build around your campaign's core intent - ${campaignType.replace('re_', '').replace('_', ' ')} searches
🗺️ **Location Intelligence**: Blend location naturally - "${location.city} luxury living", "downtown ${location.city} apartments"  
🏠 **Real Estate Essentials**: Include foundational terms that capture broader rental intent
✨ **Brand Voice Integration**: Weave in ${clientProfile.brandVoice.tone.join(' & ')} modifiers when they enhance search relevance
🚫 **Quality Control**: Use negative keywords to ensure you attract serious rental prospects, not buyers or irrelevant searches
📈 **Volume Strategy**: Generate enough keywords to provide Google's algorithm with sufficient data for optimization

Your keyword list should feel like a natural conversation between what prospects search for and what you uniquely offer. Aim for 50-80 total keywords split appropriately between broad match and negative keywords.`;
  }

  /**
   * Generate technical requirements section with contextual guidance
   */
  private static generateTechnicalRequirements(request: RealEstateCampaignRequest, clientProfile: StructuredClientProfile): string {
    // Generate campaign-specific contextual guidance
    const campaignGuidance = this.generateCampaignSpecificGuidance(request.campaignType, request, clientProfile);
    
    return `GOOGLE ADS OPTIMIZATION GUIDELINES:

🎯 HEADLINE CRAFTING (15 headlines needed):
Create punchy headlines that fit Google Ads' optimal 20-30 character sweet spot for maximum impact and visibility. This length ensures your headlines display fully across all devices while delivering compelling value propositions.

✨ Pro Character Strategy:
• Use smart abbreviations like "BR" (bedroom), "BA" (bathroom), "Apts" (apartments) to pack more value into each character
• Add impactful modifiers: "Now", "Here", "Ready", "Available" when you need extra characters for the 20-character minimum
• Every character counts - make each one deliver value to your target audience

🎯 DESCRIPTION EXCELLENCE (4 descriptions needed):
Craft compelling descriptions within the 65-90 character range that tell your property's story beautifully. This sweet spot gives you enough space to paint a vivid picture while staying within Google's display limits for optimal performance.

✨ Pro Description Strategy:
• Lead with benefit-focused messaging that resonates with your target demographic
• Include specific amenities and features that differentiate your property
• End with subtle urgency or call-to-action elements when character count allows
• Balance emotional appeal with practical information

🔑 KEYWORD REQUIREMENTS (MANDATORY):
You must generate a list of broad match and negative keywords based on the 'STRATEGIC KEYWORD INTELLIGENCE' section. Populate the 'keywords' object in the final JSON output. This is not optional.

${campaignGuidance}

🎨 CREATIVE COMPOSITION MASTERY:
Transform your atomic ingredients into compelling narratives rather than simple lists. The best ad copy blends multiple elements seamlessly:
• Amenity + Lifestyle: "Resort-style pool living" vs "Pool, luxury lifestyle" 
• Location + Feature: "Downtown convenience with in-unit laundry" vs "Downtown, laundry"
• Community + Benefit: "The Heights family haven" vs "The Heights, family-friendly"

💫 BRAND VOICE INTEGRATION for ${clientProfile.brandVoice.tone.join(' & ')} tone:
${this.generateBrandVoiceCopyGuidance(clientProfile.brandVoice.tone)}

⚡ CHARACTER OPTIMIZATION SECRETS:
• Headlines: Aim for 22-28 characters for the perfect balance of completeness and impact
• Descriptions: Target 70-85 characters to ensure full message delivery across platforms
• Use abbreviations strategically: "1BR" saves 6 characters vs "1-bedroom"
• Power words that add punch without bulk: "Now", "Here", "Plus", "New"

🚀 PERFORMANCE-DRIVEN APPROACH:
Every headline and description should feel like it was crafted by someone who deeply understands both your property's unique value and your target audience's desires. Avoid generic patterns - instead, create copy that makes prospects think "This sounds perfect for me."

🎯 OUTPUT VALIDATION:
As you create each headline and description, mentally check:
• Does this fit the character guidelines naturally?
• Would my target demographic stop scrolling for this?
• Does this showcase what makes this property special?
• Is the ${clientProfile.brandVoice.tone.join(' and ')} brand voice evident?`;
  }

  /**
   * Generate campaign-specific contextual guidance
   */
  private static generateCampaignSpecificGuidance(campaignType: string, request: RealEstateCampaignRequest, clientProfile: StructuredClientProfile): string {
    switch (campaignType) {
      case 're_general_location':
        return `🏙️ GENERAL LOCATION CAMPAIGN MASTERY:
Craft a compelling location story that naturally weaves your community name through 3-5 headlines for optimal brand recognition. This creates the perfect balance of branding and broad appeal without feeling repetitive or forced.

CHARACTER-SMART LOCATION DISTRIBUTION:
• Community-branded headlines (3-5): "Luxury Apts at [Community]", "[Community] pool access", "New to [Community]"
• Area appeal headlines (5-6): "Downtown luxury living", "Urban lifestyle awaits", "City convenience daily"
• Lifestyle benefit headlines (4-6): "Walk to work daily", "Dining at doorstep", "Transit-friendly living"

ADVANCED LOCATION STORYTELLING TECHNIQUES:
Transform your community name into a lifestyle statement:
• "[Community] luxury awaits" - positions community as premium destination
• "Discover [Community] living" - creates exploration excitement  
• "[Community] pool & spa access" - community name + specific amenity
• "New to [Community] area" - urgency + location benefit

NATURAL COMMUNITY NAME INTEGRATION:
Make your community name feel like a lifestyle choice, not just an address:
✅ "Riverside resort-style living" - community becomes lifestyle descriptor
✅ "The Heights family haven" - community name adds character and appeal
✅ "Parkside luxury available now" - community suggests benefits (proximity to park)

The goal is making your community name synonymous with the lifestyle benefits prospects are seeking.`;

      case 're_unit_type':
        const unitType = request.unitDetails?.bedrooms ? `${request.unitDetails.bedrooms}BR` : request.adGroupType;
        return `🏠 UNIT TYPE CAMPAIGN EXCELLENCE for ${unitType}:
Your target audience is specifically searching for ${unitType} units - make this the hero of every headline while showcasing why your ${unitType} is the best choice. Transform the unit type from a spec into a lifestyle statement.

CHARACTER-SMART UNIT TYPE INTEGRATION:
• Lead with unit advantage: "${unitType} luxury living" (efficient + compelling)
• Connect to daily life: "Spacious ${unitType} w/ office" (abbreviation creates space for benefit)
• Lifestyle integration: "Modern ${unitType} for professionals" (demographic targeting)
• Value positioning: "Premium ${unitType} available now" (urgency + quality)

ADVANCED UNIT TYPE STORYTELLING:
Transform every headline into a mini-story about life in your ${unitType}:
• "Wake up to ${unitType} luxury" - emotional connection to daily experience
• "${unitType} designed for success" - aspirational lifestyle messaging
• "Your perfect ${unitType} sanctuary" - personal ownership feeling
• "${unitType} where memories begin" - emotional investment

The goal is making prospects think "This ${unitType} sounds perfect for my life" rather than just "This is a ${unitType} unit."`;

      case 're_proximity':
        const targets = request.proximityTargets?.join(', ') || 'key locations';
        return `🎯 STREAMLINED PROXIMITY MASTERY near ${targets}:
Transform location advantages into lifestyle benefits using our proven 3-step approach. Focus on prestigious, recognizable places that instantly resonate with your target audience.

🌟 **SMART LOCATION STORYTELLING:**
• **Discovery Focus**: Identify the most prestigious nearby destinations that create instant appeal
• **Lifestyle Headlines**: Convert "Near [Place]" into "Walk to [Place] Daily" - make proximity feel like daily luxury
• **Convenience as Premium**: Position accessibility as a high-end amenity, not just geography

✨ **PROVEN PROXIMITY PATTERNS:**
• Time-saving transformation: "Skip commute to [Company]" vs "Near [Company]"
• Lifestyle elevation: "Coffee shop lifestyle" vs "Near coffee shops"  
• Daily routine enhancement: "Morning jog, not morning commute"

Make every proximity mention feel like a competitive lifestyle advantage that enhances daily living.`;

      default:
        return `🎯 CAMPAIGN-SPECIFIC OPTIMIZATION:
Ensure every headline and description aligns with your campaign's core value proposition while maintaining natural, compelling messaging that resonates with your target audience.`;
    }
  }

  /**
   * Generate brand voice copy guidance based on tone
   */
  private static generateBrandVoiceCopyGuidance(tones: string[]): string {
    const guidelines: string[] = [];
    
    // Add universal character-smart style guidance
    guidelines.push('Embrace character-smart style: Use "Apts" (premium efficiency), "BR" (professional brevity), "w/" (modern convenience) - these create space for compelling benefits while maintaining sophisticated appeal');
    
    tones.forEach(tone => {
      switch (tone.toLowerCase()) {
        case 'luxury':
        case 'premium':
          guidelines.push('Elevate through precision: "Exclusive Apts", "Sophisticated 2BR living", "Curated w/ premium finishes" - luxury appreciates efficiency that maximizes impact');
          break;
        case 'modern':
        case 'contemporary':
          guidelines.push('Champion efficiency: "Smart 1BR design", "Sleek Apts w/ tech", "Urban BR w/ city views" - modern audiences value streamlined communication');
          break;
        case 'friendly':
        case 'warm':
        case 'welcoming':
          guidelines.push('Warm efficiency: "Cozy 2BR home", "Welcome to Riverside Apts", "Comfortable BR w/ natural light" - friendliness enhanced by clarity');
          break;
        case 'professional':
        case 'reliable':
          guidelines.push('Professional precision: "Quality 3BR units", "Professional Apts w/ workspace", "Trusted BR layouts" - competence shown through efficient communication');
          break;
        case 'energetic':
        case 'vibrant':
          guidelines.push('Dynamic efficiency: "Exciting 2BR available", "Active Apts w/ fitness center", "Vibrant BR w/ entertainment" - energy amplified by concise impact');
          break;
      }
    });
    
    return guidelines.length > 0 ? guidelines.join('\n• ') : 'Maintain consistency with your brand voice throughout all copy elements.';
  }



  /**
   * Generate output format section
   */
  private static generateOutputFormat(): string {
    return `OUTPUT FORMAT:
Return ONLY a single valid JSON object. Do not include any text, markdown, or commentary outside of the JSON.

The JSON object must contain these four top-level keys: "headlines", "descriptions", "keywords", and "final_url_paths".

{
  "headlines": [
    "Headline 1: A compelling headline (20-30 characters)",
    "Headline 2: Another great headline (20-30 characters)",
    "...",
    "Headline 15: Final headline (20-30 characters)"
  ],
  "descriptions": [
    "Description 1: A full, detailed description for your ad (65-90 characters).",
    "Description 2: Another compelling description (65-90 characters).",
    "...",
    "Description 4: Final description (65-90 characters)."
  ],
  "keywords": { // THIS FIELD IS MANDATORY. ALWAYS INCLUDE KEYWORDS.
    "broad_match": [
      "keyword one",
      "keyword two",
      "..."
    ],
    "negative_keywords": [
      "negative one",
      "negative two",
      "..."
    ]
  },
  "final_url_paths": [
    "/path-one",
    "/path-two"
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
      keywords: aiResponse.keywords, // Ensure keywords are passed through
      final_url_paths: aiResponse.final_url_paths, // Ensure final_url_paths are passed through
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