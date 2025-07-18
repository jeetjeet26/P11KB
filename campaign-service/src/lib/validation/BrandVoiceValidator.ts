import { BrandVoiceProfile } from '../context/ClientProfileManager';

export interface BrandVoiceRule {
  type: 'required' | 'prohibited' | 'preferred' | 'style';
  category: 'tone' | 'vocabulary' | 'structure' | 'content';
  rule: string;
  keywords: string[];
  weight: number;
  examples?: string[];
}

export interface BrandVoiceValidationResult {
  overallScore: number;
  isCompliant: boolean;
  violations: BrandVoiceViolation[];
  recommendations: string[];
  strengthsIdentified: string[];
  complianceByCategory: {
    tone: number;
    vocabulary: number;
    structure: number;
    content: number;
  };
  validationSummary: string;
}

export interface BrandVoiceViolation {
  ruleType: 'required' | 'prohibited' | 'preferred' | 'style';
  category: 'tone' | 'vocabulary' | 'structure' | 'content';
  severity: 'high' | 'medium' | 'low';
  description: string;
  suggestion: string;
  affectedText?: string;
  line?: number;
}

export interface ParsedBrandGuidelines {
  toneRequirements: string[];
  vocabularyRules: {
    required: string[];
    prohibited: string[];
    preferred: string[];
  };
  structuralGuidelines: string[];
  contentRequirements: string[];
  examples: {
    good: string[];
    bad: string[];
  };
  keyMessages: string[];
  brandValues: string[];
}

export class BrandVoiceValidator {
  private static readonly DEFAULT_TONE_INDICATORS = {
    professional: ['professional', 'expertise', 'industry', 'proven', 'established', 'certified'],
    friendly: ['welcome', 'community', 'friendly', 'neighbors', 'home', 'comfortable'],
    luxury: ['luxury', 'premium', 'exclusive', 'sophisticated', 'elegant', 'upscale'],
    casual: ['relaxed', 'easy', 'simple', 'convenient', 'laid-back', 'comfortable'],
    authoritative: ['leading', 'trusted', 'expert', 'authority', 'established', 'recognized'],
    warm: ['warm', 'welcoming', 'cozy', 'inviting', 'caring', 'personal'],
    sophisticated: ['sophisticated', 'refined', 'cultured', 'discerning', 'distinctive', 'tasteful']
  };

  private static readonly PROHIBITED_REAL_ESTATE_TERMS = [
    'cheap', 'dirt cheap', 'sketchy', 'run-down', 'old', 'outdated',
    'cramped', 'tiny', 'small', 'limited', 'basic', 'minimal',
    'noise', 'loud', 'busy street', 'traffic', 'construction',
    'problem', 'issue', 'concern', 'complaint', 'negative'
  ];

  private static readonly PREFERRED_REAL_ESTATE_TERMS = [
    'spacious', 'modern', 'updated', 'convenient', 'accessible',
    'comfortable', 'stylish', 'contemporary', 'well-appointed',
    'premium', 'quality', 'value', 'investment', 'lifestyle',
    'community', 'neighborhood', 'location', 'amenities'
  ];

  /**
   * Parse brand voice guidelines from text into structured rules
   */
  static parseBrandGuidelines(guidelines: string): ParsedBrandGuidelines {
    const parsed: ParsedBrandGuidelines = {
      toneRequirements: [],
      vocabularyRules: {
        required: [],
        prohibited: [],
        preferred: []
      },
      structuralGuidelines: [],
      contentRequirements: [],
      examples: {
        good: [],
        bad: []
      },
      keyMessages: [],
      brandValues: []
    };

    if (!guidelines || guidelines.trim().length === 0) {
      return parsed;
    }

    const lowerGuidelines = guidelines.toLowerCase();
    const sentences = guidelines.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);

    sentences.forEach(sentence => {
      const lowerSentence = sentence.toLowerCase();

      // Extract tone requirements
      Object.keys(this.DEFAULT_TONE_INDICATORS).forEach(tone => {
        if (lowerSentence.includes(tone) || lowerSentence.includes(`be ${tone}`) || lowerSentence.includes(`sound ${tone}`)) {
          if (!parsed.toneRequirements.includes(tone)) {
            parsed.toneRequirements.push(tone);
          }
        }
      });

      // Extract prohibited words/phrases
      if (lowerSentence.includes('avoid') || lowerSentence.includes('don\'t use') || lowerSentence.includes('never')) {
        const prohibitedMatch = sentence.match(/(?:avoid|don't use|never)[\s\w]*?(['""][^'""]+['""])/gi);
        if (prohibitedMatch) {
          prohibitedMatch.forEach(match => {
            const term = match.replace(/.*?['""]([^'""]+)['""].*/, '$1').toLowerCase();
            if (term && !parsed.vocabularyRules.prohibited.includes(term)) {
              parsed.vocabularyRules.prohibited.push(term);
            }
          });
        }
      }

      // Extract preferred words/phrases
      if (lowerSentence.includes('use') || lowerSentence.includes('prefer') || lowerSentence.includes('include')) {
        const preferredMatch = sentence.match(/(?:use|prefer|include)[\s\w]*?(['""][^'""]+['""])/gi);
        if (preferredMatch) {
          preferredMatch.forEach(match => {
            const term = match.replace(/.*?['""]([^'""]+)['""].*/, '$1').toLowerCase();
            if (term && !parsed.vocabularyRules.preferred.includes(term)) {
              parsed.vocabularyRules.preferred.push(term);
            }
          });
        }
      }

      // Extract required elements
      if (lowerSentence.includes('must') || lowerSentence.includes('required') || lowerSentence.includes('always')) {
        if (lowerSentence.includes('include') || lowerSentence.includes('mention')) {
          parsed.vocabularyRules.required.push(sentence.trim());
        } else {
          parsed.contentRequirements.push(sentence.trim());
        }
      }

      // Extract structural guidelines
      if (lowerSentence.includes('headline') || lowerSentence.includes('description') || 
          lowerSentence.includes('format') || lowerSentence.includes('structure')) {
        parsed.structuralGuidelines.push(sentence.trim());
      }

      // Extract brand values
      if (lowerSentence.includes('value') || lowerSentence.includes('believe') || 
          lowerSentence.includes('stand for') || lowerSentence.includes('represent')) {
        parsed.brandValues.push(sentence.trim());
      }

      // Extract key messages
      if (lowerSentence.includes('message') || lowerSentence.includes('communicate') || 
          lowerSentence.includes('convey') || lowerSentence.includes('emphasize')) {
        parsed.keyMessages.push(sentence.trim());
      }
    });

    return parsed;
  }

  /**
   * Generate brand voice rules from parsed guidelines and brand profile
   */
  static generateBrandVoiceRules(
    parsedGuidelines: ParsedBrandGuidelines,
    brandProfile: BrandVoiceProfile
  ): BrandVoiceRule[] {
    
    const rules: BrandVoiceRule[] = [];

    // Tone rules
    const requiredTones = parsedGuidelines.toneRequirements.length > 0 
      ? parsedGuidelines.toneRequirements 
      : brandProfile.tone;

    requiredTones.forEach(tone => {
      const indicators = this.DEFAULT_TONE_INDICATORS[tone.toLowerCase() as keyof typeof this.DEFAULT_TONE_INDICATORS];
      if (indicators) {
        rules.push({
          type: 'preferred',
          category: 'tone',
          rule: `Maintain ${tone} tone throughout copy`,
          keywords: indicators,
          weight: 25,
          examples: this.getToneExamples(tone)
        });
      }
    });

    // Vocabulary rules - Required terms
    parsedGuidelines.vocabularyRules.required.forEach(requirement => {
      rules.push({
        type: 'required',
        category: 'vocabulary',
        rule: requirement,
        keywords: this.extractKeywordsFromText(requirement),
        weight: 30
      });
    });

    // Vocabulary rules - Prohibited terms
    const prohibitedTerms = [
      ...parsedGuidelines.vocabularyRules.prohibited,
      ...this.PROHIBITED_REAL_ESTATE_TERMS
    ];
    
    if (prohibitedTerms.length > 0) {
      rules.push({
        type: 'prohibited',
        category: 'vocabulary',
        rule: 'Avoid negative or inappropriate terminology',
        keywords: prohibitedTerms,
        weight: 35
      });
    }

    // Vocabulary rules - Preferred terms
    const preferredTerms = [
      ...parsedGuidelines.vocabularyRules.preferred,
      ...this.PREFERRED_REAL_ESTATE_TERMS
    ];

    if (preferredTerms.length > 0) {
      rules.push({
        type: 'preferred',
        category: 'vocabulary',
        rule: 'Use preferred real estate terminology',
        keywords: preferredTerms,
        weight: 20
      });
    }

    // Content requirements
    parsedGuidelines.contentRequirements.forEach(requirement => {
      rules.push({
        type: 'required',
        category: 'content',
        rule: requirement,
        keywords: this.extractKeywordsFromText(requirement),
        weight: 25
      });
    });

    // Structural guidelines
    parsedGuidelines.structuralGuidelines.forEach(guideline => {
      rules.push({
        type: 'style',
        category: 'structure',
        rule: guideline,
        keywords: this.extractKeywordsFromText(guideline),
        weight: 15
      });
    });

    // Brand value alignment
    if (brandProfile.brandValues.length > 0) {
      brandProfile.brandValues.forEach(value => {
        rules.push({
          type: 'preferred',
          category: 'content',
          rule: `Align messaging with brand value: ${value}`,
          keywords: this.getBrandValueKeywords(value),
          weight: 20
        });
      });
    }

    return rules;
  }

  /**
   * Validate ad copy against brand voice rules
   */
  static validateAdCopy(
    adCopy: { headlines: string[]; descriptions: string[] },
    rules: BrandVoiceRule[]
  ): BrandVoiceValidationResult {
    
    const violations: BrandVoiceViolation[] = [];
    const strengthsIdentified: string[] = [];
    const recommendations: string[] = [];
    
    const allText = [...adCopy.headlines, ...adCopy.descriptions];
    const combinedText = allText.join(' ').toLowerCase();

    let totalScore = 100;
    const categoryScores = {
      tone: 100,
      vocabulary: 100,
      structure: 100,
      content: 100
    };

    // Evaluate each rule
    rules.forEach(rule => {
      const ruleResult = this.evaluateRule(rule, allText, combinedText);
      
      if (ruleResult.violated) {
        const violation: BrandVoiceViolation = {
          ruleType: rule.type,
          category: rule.category,
          severity: this.determineSeverity(rule.type, rule.weight),
          description: ruleResult.description,
          suggestion: ruleResult.suggestion,
          affectedText: ruleResult.affectedText
        };
        
        violations.push(violation);
        
        // Deduct points based on rule weight and severity
        const penalty = this.calculatePenalty(violation.severity, rule.weight);
        totalScore -= penalty;
        categoryScores[rule.category] -= penalty * 2; // Category-specific penalty
        
      } else if (ruleResult.strengthIdentified) {
        strengthsIdentified.push(ruleResult.strengthIdentified);
      }
    });

    // Ensure scores don't go below 0
    totalScore = Math.max(0, totalScore);
    Object.keys(categoryScores).forEach(key => {
      categoryScores[key as keyof typeof categoryScores] = Math.max(0, categoryScores[key as keyof typeof categoryScores]);
    });

    // Generate recommendations based on violations
    recommendations.push(...this.generateRecommendations(violations, rules));

    // Generate validation summary
    const validationSummary = this.generateValidationSummary(totalScore, violations, strengthsIdentified);

    return {
      overallScore: Math.round(totalScore),
      isCompliant: totalScore >= 70 && violations.filter(v => v.severity === 'high').length === 0,
      violations,
      recommendations,
      strengthsIdentified,
      complianceByCategory: {
        tone: Math.round(categoryScores.tone),
        vocabulary: Math.round(categoryScores.vocabulary),
        structure: Math.round(categoryScores.structure),
        content: Math.round(categoryScores.content)
      },
      validationSummary
    };
  }

  /**
   * Evaluate a single rule against the ad copy
   */
  private static evaluateRule(
    rule: BrandVoiceRule,
    allText: string[],
    combinedText: string
  ): {
    violated: boolean;
    description: string;
    suggestion: string;
    affectedText?: string;
    strengthIdentified?: string;
  } {
    
    switch (rule.type) {
      case 'required':
        return this.evaluateRequiredRule(rule, allText, combinedText);
      
      case 'prohibited':
        return this.evaluateProhibitedRule(rule, allText, combinedText);
      
      case 'preferred':
        return this.evaluatePreferredRule(rule, allText, combinedText);
      
      case 'style':
        return this.evaluateStyleRule(rule, allText, combinedText);
      
      default:
        return {
          violated: false,
          description: '',
          suggestion: ''
        };
    }
  }

  /**
   * Evaluate required rules
   */
  private static evaluateRequiredRule(
    rule: BrandVoiceRule,
    allText: string[],
    combinedText: string
  ): any {
    
    const hasRequiredElements = rule.keywords.some(keyword => 
      combinedText.includes(keyword.toLowerCase())
    );

    if (!hasRequiredElements) {
      return {
        violated: true,
        description: `Missing required element: ${rule.rule}`,
        suggestion: `Include keywords: ${rule.keywords.slice(0, 3).join(', ')}`
      };
    }

    return {
      violated: false,
      description: '',
      suggestion: '',
      strengthIdentified: `Successfully includes required elements for: ${rule.rule}`
    };
  }

  /**
   * Evaluate prohibited rules
   */
  private static evaluateProhibitedRule(
    rule: BrandVoiceRule,
    allText: string[],
    combinedText: string
  ): any {
    
    const foundProhibited = rule.keywords.find(keyword => 
      combinedText.includes(keyword.toLowerCase())
    );

    if (foundProhibited) {
      const affectedLine = allText.find(line => 
        line.toLowerCase().includes(foundProhibited.toLowerCase())
      );

      return {
        violated: true,
        description: `Contains prohibited term: "${foundProhibited}"`,
        suggestion: `Remove or replace "${foundProhibited}" with more positive terminology`,
        affectedText: affectedLine
      };
    }

    return {
      violated: false,
      description: '',
      suggestion: '',
      strengthIdentified: 'Avoids prohibited terminology'
    };
  }

  /**
   * Evaluate preferred rules
   */
  private static evaluatePreferredRule(
    rule: BrandVoiceRule,
    allText: string[],
    combinedText: string
  ): any {
    
    const foundPreferred = rule.keywords.filter(keyword => 
      combinedText.includes(keyword.toLowerCase())
    );

    const preferredRatio = foundPreferred.length / rule.keywords.length;

    if (preferredRatio < 0.2) { // Less than 20% of preferred terms found
      return {
        violated: true,
        description: `Insufficient use of preferred terminology for: ${rule.rule}`,
        suggestion: `Consider including terms like: ${rule.keywords.slice(0, 3).join(', ')}`
      };
    }

    return {
      violated: false,
      description: '',
      suggestion: '',
      strengthIdentified: `Good use of preferred terminology (${foundPreferred.length} terms found)`
    };
  }

  /**
   * Evaluate style rules
   */
  private static evaluateStyleRule(
    rule: BrandVoiceRule,
    allText: string[],
    combinedText: string
  ): any {
    
    // Style rules are more complex and may require manual review
    // For now, we'll do basic keyword matching
    const foundStyleElements = rule.keywords.filter(keyword => 
      combinedText.includes(keyword.toLowerCase())
    );

    if (foundStyleElements.length === 0) {
      return {
        violated: true,
        description: `Style guideline not followed: ${rule.rule}`,
        suggestion: `Review and apply style guideline: ${rule.rule}`
      };
    }

    return {
      violated: false,
      description: '',
      suggestion: '',
      strengthIdentified: `Follows style guideline: ${rule.rule}`
    };
  }

  /**
   * Determine violation severity
   */
  private static determineSeverity(ruleType: string, weight: number): 'high' | 'medium' | 'low' {
    if (ruleType === 'prohibited' || weight >= 30) return 'high';
    if (ruleType === 'required' || weight >= 20) return 'medium';
    return 'low';
  }

  /**
   * Calculate penalty points for violations
   */
  private static calculatePenalty(severity: 'high' | 'medium' | 'low', weight: number): number {
    const basePenalty = {
      high: 15,
      medium: 10,
      low: 5
    };
    
    return basePenalty[severity] * (weight / 25); // Normalize weight to 25
  }

  /**
   * Generate recommendations based on violations
   */
  private static generateRecommendations(violations: BrandVoiceViolation[], rules: BrandVoiceRule[]): string[] {
    const recommendations: string[] = [];
    
    // High-priority recommendations
    const highSeverityViolations = violations.filter(v => v.severity === 'high');
    if (highSeverityViolations.length > 0) {
      recommendations.push('Priority 1: Address high-severity brand voice violations immediately');
      highSeverityViolations.forEach(violation => {
        recommendations.push(`- ${violation.suggestion}`);
      });
    }

    // Category-specific recommendations
    const categoryViolations = violations.reduce((acc, violation) => {
      if (!acc[violation.category]) acc[violation.category] = [];
      acc[violation.category].push(violation);
      return acc;
    }, {} as Record<string, BrandVoiceViolation[]>);

    if (categoryViolations.tone) {
      recommendations.push('Tone: Review brand voice tone requirements and adjust language accordingly');
    }
    
    if (categoryViolations.vocabulary) {
      recommendations.push('Vocabulary: Replace inappropriate terms with brand-approved alternatives');
    }

    if (categoryViolations.content) {
      recommendations.push('Content: Ensure all required brand elements and messages are included');
    }

    if (categoryViolations.structure) {
      recommendations.push('Structure: Follow brand guidelines for ad copy format and organization');
    }

    return recommendations;
  }

  /**
   * Generate validation summary
   */
  private static generateValidationSummary(
    score: number, 
    violations: BrandVoiceViolation[], 
    strengths: string[]
  ): string {
    
    let summary = `Brand Voice Compliance Score: ${Math.round(score)}/100\n`;
    
    if (score >= 90) {
      summary += 'Excellent brand voice alignment with minimal issues.';
    } else if (score >= 70) {
      summary += 'Good brand voice compliance with minor adjustments needed.';
    } else if (score >= 50) {
      summary += 'Moderate compliance - several brand voice issues need attention.';
    } else {
      summary += 'Low compliance - significant brand voice improvements required.';
    }

    if (violations.length > 0) {
      summary += `\n\nIssues found: ${violations.length} (${violations.filter(v => v.severity === 'high').length} high priority)`;
    }

    if (strengths.length > 0) {
      summary += `\n\nStrengths identified: ${strengths.length} brand voice elements properly implemented`;
    }

    return summary;
  }

  /**
   * Helper methods
   */
  private static extractKeywordsFromText(text: string): string[] {
    return text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2)
      .slice(0, 10); // Limit to 10 keywords
  }

  private static getToneExamples(tone: string): string[] {
    const examples: Record<string, string[]> = {
      professional: ['Industry-leading amenities', 'Proven track record', 'Expert property management'],
      friendly: ['Welcome home to comfort', 'Join our community', 'Your neighbors are waiting'],
      luxury: ['Exclusive residence', 'Premium finishes throughout', 'Sophisticated living'],
      casual: ['Easy living made simple', 'Relax and unwind', 'Convenient lifestyle'],
      authoritative: ['The leading choice for', 'Trusted by residents', 'Established excellence'],
      warm: ['Cozy and inviting spaces', 'A place to call home', 'Caring community'],
      sophisticated: ['Refined living spaces', 'Discerning tastes welcome', 'Tastefully appointed']
    };
    
    return examples[tone.toLowerCase()] || [];
  }

  private static getBrandValueKeywords(value: string): string[] {
    const valueKeywords: Record<string, string[]> = {
      sustainability: ['eco-friendly', 'green', 'sustainable', 'energy-efficient', 'environmental'],
      community: ['community', 'neighborhood', 'neighbors', 'social', 'events', 'gathering'],
      luxury: ['luxury', 'premium', 'upscale', 'high-end', 'exclusive', 'sophisticated'],
      innovation: ['modern', 'smart', 'technology', 'innovative', 'cutting-edge', 'advanced'],
      'service excellence': ['service', 'support', 'care', 'assistance', 'responsive', 'dedicated']
    };
    
    return valueKeywords[value.toLowerCase()] || [value.toLowerCase()];
  }

  /**
   * Generate structured brand voice requirements for use in prompts
   */
  static generateBrandVoicePromptSection(
    brandProfile: BrandVoiceProfile,
    parsedGuidelines: ParsedBrandGuidelines
  ): string {
    
    let promptSection = '=== BRAND VOICE REQUIREMENTS ===\n';

    // Tone requirements
    if (brandProfile.tone.length > 0) {
      promptSection += `REQUIRED TONE: ${brandProfile.tone.join(', ')}\n`;
    }

    // Voice guidelines
    if (brandProfile.voiceGuidelines) {
      promptSection += `VOICE GUIDELINES: ${brandProfile.voiceGuidelines}\n`;
    }

    // Vocabulary rules
    if (parsedGuidelines.vocabularyRules.required.length > 0) {
      promptSection += `REQUIRED ELEMENTS: ${parsedGuidelines.vocabularyRules.required.join('; ')}\n`;
    }

    if (parsedGuidelines.vocabularyRules.prohibited.length > 0) {
      promptSection += `PROHIBITED TERMS: ${parsedGuidelines.vocabularyRules.prohibited.join(', ')}\n`;
    }

    if (parsedGuidelines.vocabularyRules.preferred.length > 0) {
      promptSection += `PREFERRED TERMS: ${parsedGuidelines.vocabularyRules.preferred.slice(0, 10).join(', ')}\n`;
    }

    // Brand values
    if (brandProfile.brandValues.length > 0) {
      promptSection += `BRAND VALUES TO REFLECT: ${brandProfile.brandValues.join(', ')}\n`;
    }

    // Key messages
    if (parsedGuidelines.keyMessages.length > 0) {
      promptSection += `KEY MESSAGES: ${parsedGuidelines.keyMessages.join('; ')}\n`;
    }

    promptSection += '\nENSURE ALL GENERATED COPY ALIGNS WITH THESE BRAND VOICE REQUIREMENTS.\n';

    return promptSection;
  }
} 