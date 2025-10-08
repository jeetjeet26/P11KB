-- Migration: Create Materialized View for Unified Chunk Queries
-- Purpose: Simplify application queries by pre-computing chunk categorizations
-- Date: 2025-01-10

-- Step 1: Create materialized view with unified chunk representation
CREATE MATERIALIZED VIEW IF NOT EXISTS chunks_unified AS
SELECT 
  -- Core fields
  c.id,
  c.client_id,
  c.source_id,
  c.content,
  c.embedding,
  c.created_at,
  
  -- Source information
  c.source_type,
  c.document_type,
  c.source_url,
  c.page_title,
  c.crawl_timestamp,
  
  -- Community information
  c.community_name,
  
  -- Unified chunk classification
  CASE 
    WHEN c.chunk_subtype IS NOT NULL THEN c.chunk_subtype
    WHEN c.chunk_type IN ('atomic_web', 'narrative_web') THEN c.chunk_type
    ELSE c.chunk_type
  END as unified_chunk_type,
  
  -- Chunk category (atomic vs narrative)
  CASE
    WHEN c.chunk_subtype LIKE 'atomic_%' OR c.chunk_type = 'atomic_web' THEN 'atomic'
    WHEN c.chunk_subtype LIKE 'narrative_%' OR c.chunk_type = 'narrative_web' THEN 'narrative'
    WHEN c.chunk_type = 'semantic' THEN 'semantic'
    ELSE 'other'
  END as chunk_category,
  
  -- Metadata (consolidated JSONB)
  c.metadata,
  
  -- Legacy metadata fields (for backward compatibility)
  c.atomic_category,
  c.campaign_focus,
  c.amenity_category,
  c.is_pet_related,
  c.offer_expiry,
  c.floor_plan_bedrooms,
  c.location_type,
  c.price_type,
  c.char_count,
  c.content_language,
  
  -- Computed helper fields
  length(c.content) as content_length,
  c.source_type != 'document' as is_external_source,
  c.metadata->>'atomic_category' IS NOT NULL as has_atomic_metadata,
  jsonb_array_length(COALESCE(c.metadata->'campaign_focus', '[]'::jsonb)) as campaign_focus_count,
  
  -- Quality scores
  CASE
    WHEN c.char_count BETWEEN 15 AND 150 AND c.chunk_category = 'atomic' THEN 'optimal'
    WHEN c.char_count BETWEEN 300 AND 800 AND c.chunk_category = 'narrative' THEN 'optimal'
    WHEN c.char_count IS NOT NULL THEN 'acceptable'
    ELSE 'unknown'
  END as chunk_quality

FROM chunks c;

-- Step 2: Create indexes on the materialized view for fast queries
CREATE UNIQUE INDEX IF NOT EXISTS idx_chunks_unified_pk 
ON chunks_unified(id);

CREATE INDEX IF NOT EXISTS idx_chunks_unified_client_category 
ON chunks_unified(client_id, chunk_category);

CREATE INDEX IF NOT EXISTS idx_chunks_unified_client_type 
ON chunks_unified(client_id, unified_chunk_type);

CREATE INDEX IF NOT EXISTS idx_chunks_unified_source 
ON chunks_unified(client_id, source_type);

CREATE INDEX IF NOT EXISTS idx_chunks_unified_community 
ON chunks_unified(community_name) 
WHERE community_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chunks_unified_atomic_category 
ON chunks_unified(client_id, atomic_category) 
WHERE chunk_category = 'atomic';

CREATE INDEX IF NOT EXISTS idx_chunks_unified_metadata_gin 
ON chunks_unified USING GIN (metadata);

CREATE INDEX IF NOT EXISTS idx_chunks_unified_embedding 
ON chunks_unified USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

-- Step 3: Create helper function to refresh the view
CREATE OR REPLACE FUNCTION refresh_chunks_unified() 
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY chunks_unified;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refresh_chunks_unified IS 'Refresh the chunks_unified materialized view. Call after bulk chunk operations.';

-- Step 4: Create trigger to auto-refresh view (debounced)
-- Note: For production, you'd want a more sophisticated refresh strategy
-- This is a simple approach that marks the view as needing refresh

CREATE TABLE IF NOT EXISTS chunks_unified_refresh_queue (
  id SERIAL PRIMARY KEY,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  processed BOOLEAN DEFAULT FALSE
);

CREATE OR REPLACE FUNCTION queue_chunks_unified_refresh() 
RETURNS TRIGGER AS $$
BEGIN
  -- Queue a refresh request (will be processed by background job)
  INSERT INTO chunks_unified_refresh_queue (requested_at) 
  VALUES (NOW())
  ON CONFLICT DO NOTHING;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger on chunks table
CREATE TRIGGER trigger_queue_chunks_unified_refresh
AFTER INSERT OR UPDATE OR DELETE ON chunks
FOR EACH STATEMENT
EXECUTE FUNCTION queue_chunks_unified_refresh();

-- Step 5: Add helpful comments
COMMENT ON MATERIALIZED VIEW chunks_unified IS 'Unified view of chunks with pre-computed categorizations. Simplifies application queries. Refresh with refresh_chunks_unified() after bulk operations.';
COMMENT ON COLUMN chunks_unified.unified_chunk_type IS 'Standardized chunk type across all sources (e.g., atomic_amenity, narrative_location)';
COMMENT ON COLUMN chunks_unified.chunk_category IS 'High-level category: atomic, narrative, semantic, or other';
COMMENT ON COLUMN chunks_unified.chunk_quality IS 'Quality assessment based on character count: optimal, acceptable, or unknown';

-- Step 6: Create convenience views for specific use cases
CREATE OR REPLACE VIEW atomic_chunks_view AS
SELECT * FROM chunks_unified 
WHERE chunk_category = 'atomic';

CREATE OR REPLACE VIEW narrative_chunks_view AS
SELECT * FROM chunks_unified 
WHERE chunk_category = 'narrative';

COMMENT ON VIEW atomic_chunks_view IS 'Convenience view showing only atomic chunks';
COMMENT ON VIEW narrative_chunks_view IS 'Convenience view showing only narrative chunks';

-- Initial refresh
SELECT refresh_chunks_unified();

