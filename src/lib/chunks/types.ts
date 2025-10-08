/**
 * Unified Chunk Type System
 * 
 * Provides a clean, type-safe interface for working with chunks
 * regardless of their source (documents, web, intake, etc.)
 */

// ===== SOURCE TYPES =====

export type ChunkSource = 'document' | 'web' | 'intake' | 'api' | 'manual';

export type DocumentType = 
  | 'looker_report' 
  | 'client_brand_asset' 
  | 'multifamily_property' 
  | 'web_content';

// ===== CHUNK CATEGORIES =====

export type ChunkCategory = 'atomic' | 'narrative' | 'semantic' | 'other';

export type ChunkType = 'llm_dual' | 'semantic' | 'manual';

// ===== ATOMIC TYPES =====

export type AtomicType =
  | 'atomic_amenity'
  | 'atomic_feature'
  | 'atomic_floor_plan'
  | 'atomic_lifestyle'
  | 'atomic_location'
  | 'atomic_special'
  | 'atomic_urgency'
  | 'atomic_cta'
  | 'atomic_price'
  | 'atomic_community';

export type AtomicCategory =
  | 'amenity'
  | 'feature'
  | 'location'
  | 'pricing'
  | 'lifestyle'
  | 'special'
  | 'community'
  | 'cta'
  | 'urgency';

// ===== NARRATIVE TYPES =====

export type NarrativeType =
  | 'narrative_amenities'
  | 'narrative_location'
  | 'narrative_lifestyle'
  | 'narrative_community';

// ===== METADATA TYPES =====

export type AmenityCategory = 'fitness' | 'social' | 'convenience' | 'outdoor';
export type LocationType = 'proximity' | 'neighborhood' | 'transit';
export type PriceType = 'starting_at' | 'range' | 'average';
export type CampaignFocusType = 'luxury' | 'location' | 'amenities' | 'value' | 'lifestyle';

export interface ChunkMetadata {
  // Core categorization
  atomic_category?: AtomicCategory;
  campaign_focus?: CampaignFocusType[];
  
  // Specific metadata
  amenity_category?: AmenityCategory;
  location_type?: LocationType;
  price_type?: PriceType;
  
  // Boolean flags
  is_pet_related?: boolean;
  
  // Temporal data
  offer_expiry?: string; // ISO date string
  
  // Numeric data
  floor_plan_bedrooms?: number;
  char_count?: number;
  
  // Web-specific
  page_type?: string;
  content_language?: string;
  
  // Allow for extensibility
  [key: string]: any;
}

// ===== UNIFIED CHUNK INTERFACE =====

export interface UnifiedChunk {
  // Identity
  id: string;
  client_id: string;
  source_id?: string;
  
  // Content
  content: string;
  embedding?: number[];
  
  // Timestamps
  created_at: string;
  crawl_timestamp?: string;
  
  // Classification
  source: ChunkSource;
  document_type: DocumentType;
  category: ChunkCategory;
  subtype: AtomicType | NarrativeType | string;
  
  // Context
  community_name?: string;
  
  // Source information
  source_url?: string;
  page_title?: string;
  
  // Metadata (unified)
  metadata: ChunkMetadata;
  
  // Computed properties
  content_length: number;
  is_external_source: boolean;
  chunk_quality?: 'optimal' | 'acceptable' | 'unknown';
}

// ===== DATABASE CHUNK (RAW) =====

export interface DatabaseChunk {
  id: string;
  client_id: string;
  source_id?: string;
  content: string;
  embedding?: any; // pgvector type
  created_at: string;
  
  // Legacy/transitional fields
  chunk_type: string;
  chunk_subtype?: string;
  document_type: string;
  
  // New unified field
  source_type: ChunkSource;
  
  // Community
  community_name?: string;
  
  // Legacy metadata fields (for backward compatibility)
  atomic_category?: string;
  campaign_focus?: any; // jsonb
  amenity_category?: string;
  location_type?: string;
  price_type?: string;
  is_pet_related?: boolean;
  offer_expiry?: string;
  floor_plan_bedrooms?: number;
  char_count?: number;
  
  // Web fields
  source_url?: string;
  page_title?: string;
  page_type?: string;
  crawl_timestamp?: string;
  content_language?: string;
  
  // New consolidated metadata
  metadata?: any; // jsonb
}

// ===== MATERIALIZED VIEW CHUNK =====

export interface MaterializedViewChunk extends Omit<DatabaseChunk, 'chunk_type' | 'chunk_subtype'> {
  unified_chunk_type: string;
  chunk_category: ChunkCategory;
  content_length: number;
  is_external_source: boolean;
  has_atomic_metadata: boolean;
  campaign_focus_count: number;
  chunk_quality: 'optimal' | 'acceptable' | 'unknown';
}

// ===== TYPE GUARDS =====

export function isAtomicChunk(chunk: UnifiedChunk): chunk is UnifiedChunk & { subtype: AtomicType } {
  return chunk.category === 'atomic';
}

export function isNarrativeChunk(chunk: UnifiedChunk): chunk is UnifiedChunk & { subtype: NarrativeType } {
  return chunk.category === 'narrative';
}

export function isFromWeb(chunk: UnifiedChunk): boolean {
  return chunk.source === 'web';
}

export function isFromDocument(chunk: UnifiedChunk): boolean {
  return chunk.source === 'document';
}

export function hasOptimalLength(chunk: UnifiedChunk): boolean {
  if (isAtomicChunk(chunk)) {
    return chunk.content_length >= 15 && chunk.content_length <= 150;
  }
  if (isNarrativeChunk(chunk)) {
    return chunk.content_length >= 300 && chunk.content_length <= 800;
  }
  return false;
}

export function hasCampaignFocus(chunk: UnifiedChunk, focus: CampaignFocusType): boolean {
  return chunk.metadata.campaign_focus?.includes(focus) ?? false;
}

// ===== UTILITY TYPES =====

export type ChunksByCategory = {
  atomic: UnifiedChunk[];
  narrative: UnifiedChunk[];
  semantic: UnifiedChunk[];
  other: UnifiedChunk[];
};

export type AtomicChunksByCategory = {
  amenity: UnifiedChunk[];
  feature: UnifiedChunk[];
  location: UnifiedChunk[];
  pricing: UnifiedChunk[];
  lifestyle: UnifiedChunk[];
  special: UnifiedChunk[];
  community: UnifiedChunk[];
  cta: UnifiedChunk[];
  urgency: UnifiedChunk[];
};

