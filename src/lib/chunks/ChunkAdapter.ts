/**
 * Chunk Adapter
 * 
 * Handles all conversion logic between database formats and the unified chunk interface.
 * This is the SINGLE SOURCE OF TRUTH for chunk format conversion.
 */

import {
  UnifiedChunk,
  DatabaseChunk,
  MaterializedViewChunk,
  ChunkSource,
  ChunkCategory,
  ChunkMetadata,
  AtomicType,
  NarrativeType,
  AtomicCategory,
  ChunksByCategory,
  AtomicChunksByCategory,
  isAtomicChunk,
  isNarrativeChunk,
  DocumentType,
} from './types';

export class ChunkAdapter {
  /**
   * Convert database chunk to unified format
   * Handles all the legacy dual pattern logic in ONE place
   */
  static toUnified(dbChunk: DatabaseChunk): UnifiedChunk {
    // Determine source
    const source: ChunkSource = dbChunk.source_type || this.inferSource(dbChunk);
    
    // Determine subtype (handles both old and new patterns)
    const subtype = this.determineSubtype(dbChunk);
    
    // Determine category
    const category = this.determineCategory(subtype, dbChunk);
    
    // Build unified metadata
    const metadata = this.buildMetadata(dbChunk);
    
    // Calculate quality
    const contentLength = dbChunk.content.length;
    const chunkQuality = this.assessQuality(contentLength, category);
    
    return {
      // Identity
      id: dbChunk.id,
      client_id: dbChunk.client_id,
      source_id: dbChunk.source_id,
      
      // Content
      content: dbChunk.content,
      embedding: dbChunk.embedding ? Array.from(dbChunk.embedding as any) : undefined,
      
      // Timestamps
      created_at: dbChunk.created_at,
      crawl_timestamp: dbChunk.crawl_timestamp,
      
      // Classification
      source,
      document_type: dbChunk.document_type as DocumentType,
      category,
      subtype,
      
      // Context
      community_name: dbChunk.community_name,
      
      // Source information
      source_url: dbChunk.source_url,
      page_title: dbChunk.page_title,
      
      // Metadata
      metadata,
      
      // Computed
      content_length: contentLength,
      is_external_source: source !== 'document',
      chunk_quality: chunkQuality,
    };
  }
  
  /**
   * Convert materialized view chunk to unified format
   * (Simpler since the view pre-computes many fields)
   */
  static fromMaterializedView(viewChunk: MaterializedViewChunk): UnifiedChunk {
    const metadata = this.buildMetadata(viewChunk);
    
    return {
      id: viewChunk.id,
      client_id: viewChunk.client_id,
      source_id: viewChunk.source_id,
      content: viewChunk.content,
      embedding: viewChunk.embedding ? Array.from(viewChunk.embedding as any) : undefined,
      created_at: viewChunk.created_at,
      crawl_timestamp: viewChunk.crawl_timestamp,
      source: viewChunk.source_type,
      document_type: viewChunk.document_type as DocumentType,
      category: viewChunk.chunk_category,
      subtype: viewChunk.unified_chunk_type,
      community_name: viewChunk.community_name,
      source_url: viewChunk.source_url,
      page_title: viewChunk.page_title,
      metadata,
      content_length: viewChunk.content_length,
      is_external_source: viewChunk.is_external_source,
      chunk_quality: viewChunk.chunk_quality,
    };
  }
  
  /**
   * Convert unified chunk back to database format
   * Used when creating new chunks
   */
  static toDatabase(unified: UnifiedChunk): Partial<DatabaseChunk> {
    return {
      client_id: unified.client_id,
      source_id: unified.source_id,
      content: unified.content,
      embedding: unified.embedding as any,
      
      // New unified fields
      chunk_type: 'llm_dual',
      chunk_subtype: unified.subtype,
      source_type: unified.source,
      document_type: unified.document_type,
      
      // Community
      community_name: unified.community_name,
      
      // Legacy fields for backward compatibility
      atomic_category: unified.metadata.atomic_category,
      campaign_focus: unified.metadata.campaign_focus as any,
      amenity_category: unified.metadata.amenity_category,
      location_type: unified.metadata.location_type,
      price_type: unified.metadata.price_type,
      is_pet_related: unified.metadata.is_pet_related,
      offer_expiry: unified.metadata.offer_expiry,
      floor_plan_bedrooms: unified.metadata.floor_plan_bedrooms,
      char_count: unified.metadata.char_count || unified.content_length,
      
      // Web fields
      source_url: unified.source_url,
      page_title: unified.page_title,
      page_type: unified.metadata.page_type,
      content_language: unified.metadata.content_language,
      
      // New consolidated metadata
      metadata: unified.metadata as any,
    };
  }
  
  /**
   * Batch convert array of database chunks
   */
  static toUnifiedBatch(dbChunks: DatabaseChunk[]): UnifiedChunk[] {
    return dbChunks.map(chunk => this.toUnified(chunk));
  }
  
  /**
   * Batch convert array of materialized view chunks
   */
  static fromMaterializedViewBatch(viewChunks: MaterializedViewChunk[]): UnifiedChunk[] {
    return viewChunks.map(chunk => this.fromMaterializedView(chunk));
  }
  
  /**
   * Group chunks by category
   */
  static groupByCategory(chunks: UnifiedChunk[]): ChunksByCategory {
    return {
      atomic: chunks.filter(c => c.category === 'atomic'),
      narrative: chunks.filter(c => c.category === 'narrative'),
      semantic: chunks.filter(c => c.category === 'semantic'),
      other: chunks.filter(c => c.category === 'other'),
    };
  }
  
  /**
   * Group atomic chunks by atomic category
   */
  static groupAtomicByCategory(chunks: UnifiedChunk[]): AtomicChunksByCategory {
    const atomicChunks = chunks.filter(isAtomicChunk);
    
    return {
      amenity: atomicChunks.filter(c => c.metadata.atomic_category === 'amenity'),
      feature: atomicChunks.filter(c => c.metadata.atomic_category === 'feature'),
      location: atomicChunks.filter(c => c.metadata.atomic_category === 'location'),
      pricing: atomicChunks.filter(c => c.metadata.atomic_category === 'pricing'),
      lifestyle: atomicChunks.filter(c => c.metadata.atomic_category === 'lifestyle'),
      special: atomicChunks.filter(c => c.metadata.atomic_category === 'special'),
      community: atomicChunks.filter(c => c.metadata.atomic_category === 'community'),
      cta: atomicChunks.filter(c => c.metadata.atomic_category === 'cta'),
      urgency: atomicChunks.filter(c => c.metadata.atomic_category === 'urgency'),
    };
  }
  
  // ===== PRIVATE HELPER METHODS =====
  
  private static inferSource(dbChunk: DatabaseChunk): ChunkSource {
    // Infer source from available data
    if (dbChunk.source_url) return 'web';
    return 'document';
  }
  
  private static determineSubtype(dbChunk: DatabaseChunk): string {
    // Priority: chunk_subtype > chunk_type (for legacy web chunks)
    if (dbChunk.chunk_subtype) {
      return dbChunk.chunk_subtype;
    }
    
    // Legacy web chunks used chunk_type for subtype
    if (dbChunk.chunk_type === 'atomic_web' || dbChunk.chunk_type === 'narrative_web') {
      return dbChunk.chunk_type;
    }
    
    // Fallback to chunk_type
    return dbChunk.chunk_type;
  }
  
  private static determineCategory(subtype: string, dbChunk: DatabaseChunk): ChunkCategory {
    if (subtype.startsWith('atomic_') || subtype === 'atomic_web') {
      return 'atomic';
    }
    if (subtype.startsWith('narrative_') || subtype === 'narrative_web') {
      return 'narrative';
    }
    if (subtype === 'semantic' || dbChunk.chunk_type === 'semantic') {
      return 'semantic';
    }
    return 'other';
  }
  
  private static buildMetadata(dbChunk: DatabaseChunk | MaterializedViewChunk): ChunkMetadata {
    // If new metadata field exists and is populated, use it
    if (dbChunk.metadata && typeof dbChunk.metadata === 'object' && Object.keys(dbChunk.metadata).length > 0) {
      return dbChunk.metadata as ChunkMetadata;
    }
    
    // Otherwise, build from legacy fields
    return {
      atomic_category: dbChunk.atomic_category as AtomicCategory | undefined,
      campaign_focus: this.parseCampaignFocus(dbChunk.campaign_focus),
      amenity_category: dbChunk.amenity_category as any,
      location_type: dbChunk.location_type as any,
      price_type: dbChunk.price_type as any,
      is_pet_related: dbChunk.is_pet_related,
      offer_expiry: dbChunk.offer_expiry,
      floor_plan_bedrooms: dbChunk.floor_plan_bedrooms,
      char_count: dbChunk.char_count,
      page_type: dbChunk.page_type,
      content_language: dbChunk.content_language || 'en',
    };
  }
  
  private static parseCampaignFocus(campaignFocus: any): string[] | undefined {
    if (!campaignFocus) return undefined;
    if (Array.isArray(campaignFocus)) return campaignFocus;
    if (typeof campaignFocus === 'string') {
      try {
        const parsed = JSON.parse(campaignFocus);
        return Array.isArray(parsed) ? parsed : undefined;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
  
  private static assessQuality(
    contentLength: number, 
    category: ChunkCategory
  ): 'optimal' | 'acceptable' | 'unknown' {
    if (category === 'atomic') {
      if (contentLength >= 15 && contentLength <= 150) return 'optimal';
      if (contentLength > 0) return 'acceptable';
    }
    if (category === 'narrative') {
      if (contentLength >= 300 && contentLength <= 800) return 'optimal';
      if (contentLength > 0) return 'acceptable';
    }
    return 'unknown';
  }
  
  /**
   * Derive atomic_category from atomic subtype
   * Used when creating chunks
   */
  static deriveAtomicCategory(subtype: AtomicType): AtomicCategory {
    const mapping: Record<AtomicType, AtomicCategory> = {
      'atomic_amenity': 'amenity',
      'atomic_feature': 'feature',
      'atomic_floor_plan': 'feature',
      'atomic_lifestyle': 'lifestyle',
      'atomic_location': 'location',
      'atomic_special': 'special',
      'atomic_urgency': 'urgency',
      'atomic_cta': 'cta',
      'atomic_price': 'pricing',
      'atomic_community': 'community',
    };
    return mapping[subtype] || 'feature';
  }
}

// Re-export types for convenience
export type { UnifiedChunk, ChunkMetadata, ChunksByCategory, AtomicChunksByCategory };
export { isAtomicChunk, isNarrativeChunk };

