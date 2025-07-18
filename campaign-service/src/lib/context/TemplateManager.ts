import { StructuredCampaignContext } from './CampaignContextBuilder';
import { StructuredClientProfile } from './ClientProfileManager';

export interface AdCopyTemplate {
  name: string;
  campaignType: string;
  adGroupType: string;
  brandVoiceMatch: string[];
  demographicMatch: string[];
  templates: {
    headlines: {
      pattern: string;
      variables: string[];
      examples: string[];
      maxLength: number;
    }[];
    descriptions: {
      pattern: string;
      variables: string[];
      examples: string[];
      maxLength: number;
    }[];
  };
  variableReplacements: {
    [key: string]: {
      sources: ('location' | 'property' | 'unit' | 'amenities' | 'brand' | 'demographics' | 'proximity')[];
      fallback: string;
    };
  };
}

export interface TemplateVariable {
  name: string;
  value: string;
  source: string;
  confidence: number;
}

export class TemplateManager {
  private static readonly HEADLINE_TEMPLATES: AdCopyTemplate[] = [
    {
      name: 'Location Premium',
      campaignType: 're_general_location',
      adGroupType: 'location_general',
      brandVoiceMatch: ['luxury', 'premium', 'sophisticated'],
      demographicMatch: ['professionals', 'affluent'],
      templates: {
        headlines: [
          {
            pattern: '{location} Luxury Living',
            variables: ['location'],
            examples: ['Downtown Luxury Living', 'Uptown Luxury Living'],
            maxLength: 30
          },
          {
            pattern: 'Premium {location} Life',
            variables: ['location'],
            examples: ['Premium Dallas Life', 'Premium Austin Life'],
            maxLength: 30
          },
          {
            pattern: '{community} Awaits You',
            variables: ['community'],
            examples: ['The Residences Awaits You', 'Park Place Awaits You'],
            maxLength: 30
          }
        ],
        descriptions: [
          {
            pattern: 'Experience luxury living in {location} with premium amenities and {amenity}.',
            variables: ['location', 'amenity'],
            examples: ['Experience luxury living in downtown with premium amenities and concierge.'],
            maxLength: 90
          },
          {
            pattern: 'Discover your perfect home at {community} featuring {amenity} and more.',
            variables: ['community', 'amenity'],
            examples: ['Discover your perfect home at The Heights featuring rooftop pool and more.'],
            maxLength: 90
          }
        ]
      },
      variableReplacements: {
        'location': { sources: ['location'], fallback: 'Downtown' },
        'community': { sources: ['property'], fallback: 'The Community' },
        'amenity': { sources: ['amenities'], fallback: 'luxury amenities' }
      }
    },
    {
      name: 'Unit Type Focus',
      campaignType: 're_unit_type',
      adGroupType: '2br',
      brandVoiceMatch: ['comfortable', 'spacious', 'family'],
      demographicMatch: ['families', 'roommates'],
      templates: {
        headlines: [
          {
            pattern: 'Spacious {unit} Living',
            variables: ['unit'],
            examples: ['Spacious 2BR Living', 'Spacious Studio Living'],
            maxLength: 30
          },
          {
            pattern: '{unit} w/ {amenity}',
            variables: ['unit', 'amenity'],
            examples: ['2BR w/ Balcony', '1BR w/ Office'],
            maxLength: 30
          },
          {
            pattern: 'Perfect {unit} Home',
            variables: ['unit'],
            examples: ['Perfect 2BR Home', 'Perfect Studio Home'],
            maxLength: 30
          }
        ],
        descriptions: [
          {
            pattern: 'Enjoy {sqft} sqft of {unit} living with {amenity} and modern features.',
            variables: ['sqft', 'unit', 'amenity'],
            examples: ['Enjoy 1200 sqft of 2-bedroom living with balcony and modern features.'],
            maxLength: 90
          },
          {
            pattern: 'Spacious {unit} perfect for {demographic} seeking {benefit}.',
            variables: ['unit', 'demographic', 'benefit'],
            examples: ['Spacious 2-bedroom perfect for families seeking comfort and space.'],
            maxLength: 90
          }
        ]
      },
      variableReplacements: {
        'unit': { sources: ['unit'], fallback: '2-bedroom' },
        'sqft': { sources: ['unit'], fallback: '1000+' },
        'amenity': { sources: ['amenities'], fallback: 'modern features' },
        'demographic': { sources: ['demographics'], fallback: 'residents' },
        'benefit': { sources: ['demographics'], fallback: 'comfort' }
      }
    },
    {
      name: 'Proximity Convenience',
      campaignType: 're_proximity',
      adGroupType: 'near_transit',
      brandVoiceMatch: ['convenient', 'practical', 'smart'],
      demographicMatch: ['commuters', 'professionals'],
      templates: {
        headlines: [
          {
            pattern: 'Walk to {target}',
            variables: ['target'],
            examples: ['Walk to Metro', 'Walk to Campus'],
            maxLength: 30
          },
          {
            pattern: 'Near {target} Living',
            variables: ['target'],
            examples: ['Near Station Living', 'Near Downtown Living'],
            maxLength: 30
          },
          {
            pattern: '{minutes}min to {target}',
            variables: ['minutes', 'target'],
            examples: ['5min to Metro', '10min to Campus'],
            maxLength: 30
          }
        ],
        descriptions: [
          {
            pattern: 'Skip the commute stress with easy access to {target} and {benefit}.',
            variables: ['target', 'benefit'],
            examples: ['Skip the commute stress with easy access to Metro and downtown.'],
            maxLength: 90
          },
          {
            pattern: 'Perfect for {demographic} who value proximity to {target}.',
            variables: ['demographic', 'target'],
            examples: ['Perfect for professionals who value proximity to transit hubs.'],
            maxLength: 90
          }
        ]
      },
      variableReplacements: {
        'target': { sources: ['proximity'], fallback: 'transit' },
        'minutes': { sources: ['location'], fallback: '5' },
        'benefit': { sources: ['location'], fallback: 'convenience' },
        'demographic': { sources: ['demographics'], fallback: 'residents' }
      }
    }
  ];

  /**
   * Select templates that match the campaign context and client profile
   */
  static selectMatchingTemplates(
    context: StructuredCampaignContext,
    profile: StructuredClientProfile
  ): AdCopyTemplate[] {
    
    const matchingTemplates = this.HEADLINE_TEMPLATES.filter(template => {
      // Match campaign type and ad group
      if (template.campaignType !== context.campaignType) return false;
      
      // Exact ad group match gets priority
      if (template.adGroupType === context.adGroupType) return true;
      
      // Brand voice matching
      const clientTones = profile.brandVoice.tone.map(t => t.toLowerCase());
      const templateTones = template.brandVoiceMatch.map(t => t.toLowerCase());
      if (clientTones.some(tone => templateTones.includes(tone))) return true;
      
      // Demographic matching
      const clientDemo = profile.demographics.primaryAudience?.toLowerCase() || '';
      const templateDemos = template.demographicMatch.map(d => d.toLowerCase());
      if (templateDemos.some(demo => clientDemo.includes(demo))) return true;
      
      return false;
    });

    return matchingTemplates.slice(0, 3); // Return top 3 matching templates
  }

  /**
   * Extract template variables from campaign context and client profile
   */
  static extractTemplateVariables(
    context: StructuredCampaignContext,
    profile: StructuredClientProfile,
    request: any
  ): TemplateVariable[] {
    
    const variables: TemplateVariable[] = [];

    // Location variables
    variables.push({
      name: 'location',
      value: request.location.city,
      source: 'location',
      confidence: 1.0
    });

    // Property/Community variables
    if (profile.property.communityName) {
      variables.push({
        name: 'community',
        value: profile.property.communityName,
        source: 'property',
        confidence: 1.0
      });
    }

    // Unit variables
    if (request.unitDetails) {
      const unit = request.unitDetails;
      const unitDescription = unit.bedrooms === 0 ? 'Studio' : `${unit.bedrooms}BR`;
      
      variables.push({
        name: 'unit',
        value: unitDescription,
        source: 'unit',
        confidence: 1.0
      });

      if (unit.sqft) {
        variables.push({
          name: 'sqft',
          value: unit.sqft,
          source: 'unit',
          confidence: 1.0
        });
      }
    }

    // Amenity variables
    if (profile.property.amenities.length > 0) {
      const topAmenity = profile.property.amenities[0];
      variables.push({
        name: 'amenity',
        value: topAmenity.toLowerCase(),
        source: 'amenities',
        confidence: 0.8
      });
    }

    // Proximity variables
    if (request.proximityTargets?.length > 0) {
      variables.push({
        name: 'target',
        value: request.proximityTargets[0],
        source: 'proximity',
        confidence: 1.0
      });
    }

    // Demographic variables
    if (profile.demographics.primaryAudience) {
      variables.push({
        name: 'demographic',
        value: profile.demographics.primaryAudience.toLowerCase(),
        source: 'demographics',
        confidence: 0.7
      });
    }

    return variables;
  }

  /**
   * Generate template-based examples for prompt enhancement
   */
  static generateTemplateExamples(
    context: StructuredCampaignContext,
    profile: StructuredClientProfile,
    request: any
  ): string {
    
    const matchingTemplates = this.selectMatchingTemplates(context, profile);
    const variables = this.extractTemplateVariables(context, profile, request);
    
    if (matchingTemplates.length === 0) {
      return 'No specific templates available. Use best practices for ad copy generation.';
    }

    let templateGuidance = 'TEMPLATE-BASED EXAMPLES:\n';
    templateGuidance += 'Use these proven templates, customized with your specific variables:\n\n';

    matchingTemplates.forEach((template, index) => {
      templateGuidance += `Template ${index + 1}: ${template.name}\n`;
      
      // Headline templates
      templateGuidance += 'Headlines:\n';
      template.templates.headlines.slice(0, 3).forEach(headlineTemplate => {
        const customized = this.customizeTemplate(headlineTemplate.pattern, variables, template.variableReplacements);
        templateGuidance += `- "${customized}" (${customized.length} chars)\n`;
      });
      
      // Description templates
      templateGuidance += 'Descriptions:\n';
      template.templates.descriptions.slice(0, 2).forEach(descTemplate => {
        const customized = this.customizeTemplate(descTemplate.pattern, variables, template.variableReplacements);
        templateGuidance += `- "${customized}" (${customized.length} chars)\n`;
      });
      
      templateGuidance += '\n';
    });

    templateGuidance += 'TEMPLATE ADAPTATION RULES:\n';
    templateGuidance += '- Customize patterns with your specific variables\n';
    templateGuidance += '- Maintain character limits strictly\n';
    templateGuidance += '- Ensure brand voice consistency\n';
    templateGuidance += '- Adapt messaging to your target demographic\n';

    return templateGuidance;
  }

  /**
   * Customize a template pattern with available variables
   */
  private static customizeTemplate(
    pattern: string,
    variables: TemplateVariable[],
    replacements: { [key: string]: { sources: string[]; fallback: string } }
  ): string {
    
    let customized = pattern;
    
    // Find all variables in the pattern
    const variableMatches = pattern.match(/\{([^}]+)\}/g);
    
    if (variableMatches) {
      variableMatches.forEach(match => {
        const variableName = match.slice(1, -1); // Remove { and }
        
        // Find matching variable
        const variable = variables.find(v => v.name === variableName);
        
        if (variable) {
          customized = customized.replace(match, variable.value);
        } else if (replacements[variableName]) {
          // Use fallback
          customized = customized.replace(match, replacements[variableName].fallback);
        } else {
          // Leave as is or use generic fallback
          customized = customized.replace(match, variableName);
        }
      });
    }

    return customized;
  }

  /**
   * Generate template insights for logging
   */
  static generateTemplateInsights(
    context: StructuredCampaignContext,
    profile: StructuredClientProfile
  ): object {
    
    const matchingTemplates = this.selectMatchingTemplates(context, profile);
    
    return {
      availableTemplates: matchingTemplates.length,
      templateNames: matchingTemplates.map(t => t.name),
      campaignTypeMatch: matchingTemplates.filter(t => t.campaignType === context.campaignType).length,
      adGroupTypeMatch: matchingTemplates.filter(t => t.adGroupType === context.adGroupType).length,
      brandVoiceMatch: matchingTemplates.filter(t => 
        t.brandVoiceMatch.some(bv => 
          profile.brandVoice.tone.some(tone => tone.toLowerCase().includes(bv.toLowerCase()))
        )
      ).length
    };
  }
} 