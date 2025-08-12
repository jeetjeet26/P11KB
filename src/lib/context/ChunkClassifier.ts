export enum ChunkType {
  BRAND_VOICE = 'brand_voice',
  DEMOGRAPHICS = 'demographics', 
  PROPERTY_FEATURES = 'property_features',
  LOCAL_AREA = 'local_area',
  COMPETITOR_INTELLIGENCE = 'competitor_intelligence',
  GENERAL = 'general'
}

export interface ClassifiedChunk {
  content: string;
  type: ChunkType;
  confidence: number;
  relevanceScore: number;
  metadata?: any;
  originalIndex: number;
}

export interface CategorizedChunks {
  brandVoice: ClassifiedChunk[];
  demographics: ClassifiedChunk[];
  propertyFeatures: ClassifiedChunk[];
  localArea: ClassifiedChunk[];
  competitorIntelligence: ClassifiedChunk[];
  general: ClassifiedChunk[];
}

export class ChunkClassifier {
  // Keywords for each chunk type
  private static readonly CLASSIFICATION_KEYWORDS = {
    [ChunkType.BRAND_VOICE]: [
      'brand', 'voice', 'tone', 'messaging', 'communication', 'style',
      'personality', 'guidelines', 'copy', 'advertising', 'marketing',
      'brand identity', 'brand positioning', 'tagline', 'slogan',
      'voice guidelines', 'communication style', 'brand standards'
    ],
    
    [ChunkType.DEMOGRAPHICS]: [
      'demographics', 'psychographics', 'target audience', 'customer',
      'resident', 'renter', 'buyer', 'persona', 'age', 'income',
      'lifestyle', 'behavior', 'preferences', 'household', 'family',
      'professional', 'student', 'young', 'millennial', 'gen z',
      'baby boomer', 'single', 'married', 'couple', 'roommate'
    ],
    
    [ChunkType.PROPERTY_FEATURES]: [
      'amenities', 'features', 'apartment', 'unit', 'bedroom', 'bathroom',
      'square feet', 'sqft', 'kitchen', 'living room', 'balcony',
      'pool', 'gym', 'fitness', 'parking', 'garage', 'pet',
      'laundry', 'washer', 'dryer', 'dishwasher', 'air conditioning',
      'heating', 'flooring', 'appliances', 'closet', 'storage'
    ],
    
    [ChunkType.LOCAL_AREA]: [
      'neighborhood', 'area', 'location', 'nearby', 'close to', 'near',
      'walking distance', 'drive', 'transportation', 'transit', 'bus',
      'train', 'subway', 'metro', 'airport', 'downtown', 'uptown',
      'restaurant', 'dining', 'shopping', 'mall', 'entertainment',
      'park', 'recreation', 'school', 'university', 'hospital',
      'employer', 'office', 'business district'
    ],
    
    [ChunkType.COMPETITOR_INTELLIGENCE]: [
      'competitor', 'competition', 'versus', 'compared to', 'alternative',
      'other properties', 'similar communities', 'competing',
      'market position', 'differentiation', 'advantage', 'unique',
      'better than', 'superior', 'exclusive', 'only', 'first'
    ]
  };

  /**
   * Classify chunks retrieved from vector search into categories
   */
  static classifyChunks(chunks: any[]): CategorizedChunks {
    const classified: ClassifiedChunk[] = chunks.map((chunk, index) => {
      const classification = this.classifyIndividualChunk(chunk.content, index);
      return {
        ...classification,
        metadata: chunk.metadata,
        relevanceScore: chunk.similarity || 0
      };
    });

    // Sort by relevance score within each category
    const categorized: CategorizedChunks = {
      brandVoice: classified.filter(c => c.type === ChunkType.BRAND_VOICE)
        .sort((a, b) => b.relevanceScore - a.relevanceScore),
      demographics: classified.filter(c => c.type === ChunkType.DEMOGRAPHICS)
        .sort((a, b) => b.relevanceScore - a.relevanceScore),
      propertyFeatures: classified.filter(c => c.type === ChunkType.PROPERTY_FEATURES)
        .sort((a, b) => b.relevanceScore - a.relevanceScore),
      localArea: classified.filter(c => c.type === ChunkType.LOCAL_AREA)
        .sort((a, b) => b.relevanceScore - a.relevanceScore),
      competitorIntelligence: classified.filter(c => c.type === ChunkType.COMPETITOR_INTELLIGENCE)
        .sort((a, b) => b.relevanceScore - a.relevanceScore),
      general: classified.filter(c => c.type === ChunkType.GENERAL)
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
    };

    return categorized;
  }

  /**
   * Classify a single chunk and determine its type and confidence
   */
  private static classifyIndividualChunk(content: string, originalIndex: number): ClassifiedChunk {
    const contentLower = content.toLowerCase();
    const scores: { [key in ChunkType]: number } = {
      [ChunkType.BRAND_VOICE]: 0,
      [ChunkType.DEMOGRAPHICS]: 0,
      [ChunkType.PROPERTY_FEATURES]: 0,
      [ChunkType.LOCAL_AREA]: 0,
      [ChunkType.COMPETITOR_INTELLIGENCE]: 0,
      [ChunkType.GENERAL]: 0
    };

    // Calculate scores for each category
    Object.entries(this.CLASSIFICATION_KEYWORDS).forEach(([type, keywords]) => {
      const matchingKeywords = keywords.filter(keyword => 
        contentLower.includes(keyword.toLowerCase())
      );
      
      // Score based on number of matches and keyword importance
      scores[type as ChunkType] = matchingKeywords.length + 
        this.calculateSemanticScore(contentLower, keywords);
    });

    // Find the category with the highest score
    const maxScore = Math.max(...Object.values(scores));
    const bestType = Object.entries(scores).find(([_, score]) => score === maxScore)?.[0] as ChunkType;
    
    // If no strong classification, mark as general
    const finalType = maxScore > 0 ? bestType : ChunkType.GENERAL;
    const confidence = maxScore > 0 ? Math.min(maxScore / 10, 1) : 0.1;

    return {
      content,
      type: finalType,
      confidence,
      relevanceScore: 0, // Will be set from chunk similarity
      originalIndex
    };
  }

  /**
   * Calculate semantic scoring based on keyword density and context
   */
  private static calculateSemanticScore(content: string, keywords: string[]): number {
    let semanticScore = 0;
    const contentWords = content.split(/\s+/);
    const totalWords = contentWords.length;

    // Bonus for keyword density
    keywords.forEach(keyword => {
      const keywordWords = keyword.split(/\s+/);
      if (keywordWords.length === 1) {
        // Single word keyword
        const matches = contentWords.filter(word => word.includes(keyword.toLowerCase()));
        semanticScore += (matches.length / totalWords) * 2;
      } else {
        // Multi-word phrase
        if (content.includes(keyword.toLowerCase())) {
          semanticScore += 3; // Higher bonus for exact phrase matches
        }
      }
    });

    return semanticScore;
  }

  /**
   * Get the top N chunks from each category
   */
  static getTopChunksByCategory(
    categorized: CategorizedChunks, 
    maxPerCategory: number = 3
  ): CategorizedChunks {
    return {
      brandVoice: categorized.brandVoice.slice(0, maxPerCategory),
      demographics: categorized.demographics.slice(0, maxPerCategory),
      propertyFeatures: categorized.propertyFeatures.slice(0, maxPerCategory),
      localArea: categorized.localArea.slice(0, maxPerCategory),
      competitorIntelligence: categorized.competitorIntelligence.slice(0, maxPerCategory),
      general: categorized.general.slice(0, maxPerCategory)
    };
  }

  /**
   * Get summary statistics for categorized chunks
   */
  static getCategorySummary(categorized: CategorizedChunks) {
    return {
      brandVoice: {
        count: categorized.brandVoice.length,
        avgConfidence: this.calculateAverageConfidence(categorized.brandVoice),
        avgRelevance: this.calculateAverageRelevance(categorized.brandVoice)
      },
      demographics: {
        count: categorized.demographics.length,
        avgConfidence: this.calculateAverageConfidence(categorized.demographics),
        avgRelevance: this.calculateAverageRelevance(categorized.demographics)
      },
      propertyFeatures: {
        count: categorized.propertyFeatures.length,
        avgConfidence: this.calculateAverageConfidence(categorized.propertyFeatures),
        avgRelevance: this.calculateAverageRelevance(categorized.propertyFeatures)
      },
      localArea: {
        count: categorized.localArea.length,
        avgConfidence: this.calculateAverageConfidence(categorized.localArea),
        avgRelevance: this.calculateAverageRelevance(categorized.localArea)
      },
      competitorIntelligence: {
        count: categorized.competitorIntelligence.length,
        avgConfidence: this.calculateAverageConfidence(categorized.competitorIntelligence),
        avgRelevance: this.calculateAverageRelevance(categorized.competitorIntelligence)
      },
      general: {
        count: categorized.general.length,
        avgConfidence: this.calculateAverageConfidence(categorized.general),
        avgRelevance: this.calculateAverageRelevance(categorized.general)
      }
    };
  }

  private static calculateAverageConfidence(chunks: ClassifiedChunk[]): number {
    if (chunks.length === 0) return 0;
    return chunks.reduce((sum, chunk) => sum + chunk.confidence, 0) / chunks.length;
  }

  private static calculateAverageRelevance(chunks: ClassifiedChunk[]): number {
    if (chunks.length === 0) return 0;
    return chunks.reduce((sum, chunk) => sum + chunk.relevanceScore, 0) / chunks.length;
  }

  /**
   * Generate structured context text from categorized chunks
   */
  static generateStructuredContext(categorized: CategorizedChunks): string {
    let structuredContext = '';

    if (categorized.brandVoice.length > 0) {
      structuredContext += '\n=== BRAND VOICE & MESSAGING GUIDELINES ===\n';
      categorized.brandVoice.forEach((chunk, index) => {
        structuredContext += `[Brand Voice ${index + 1}]\n${chunk.content}\n\n`;
      });
    }

    if (categorized.demographics.length > 0) {
      structuredContext += '\n=== TARGET DEMOGRAPHICS & PSYCHOGRAPHICS ===\n';
      categorized.demographics.forEach((chunk, index) => {
        structuredContext += `[Demographics ${index + 1}]\n${chunk.content}\n\n`;
      });
    }

    if (categorized.propertyFeatures.length > 0) {
      structuredContext += '\n=== PROPERTY FEATURES & AMENITIES ===\n';
      categorized.propertyFeatures.forEach((chunk, index) => {
        structuredContext += `[Property Features ${index + 1}]\n${chunk.content}\n\n`;
      });
    }

    if (categorized.localArea.length > 0) {
      structuredContext += '\n=== LOCAL AREA & LIFESTYLE INSIGHTS ===\n';
      categorized.localArea.forEach((chunk, index) => {
        structuredContext += `[Local Area ${index + 1}]\n${chunk.content}\n\n`;
      });
    }

    if (categorized.competitorIntelligence.length > 0) {
      structuredContext += '\n=== COMPETITOR INTELLIGENCE ===\n';
      categorized.competitorIntelligence.forEach((chunk, index) => {
        structuredContext += `[Competitor Intel ${index + 1}]\n${chunk.content}\n\n`;
      });
    }

    if (categorized.general.length > 0) {
      structuredContext += '\n=== ADDITIONAL CONTEXT ===\n';
      categorized.general.forEach((chunk, index) => {
        structuredContext += `[General Context ${index + 1}]\n${chunk.content}\n\n`;
      });
    }

    return structuredContext;
  }
} 