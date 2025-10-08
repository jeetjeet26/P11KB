-- Migration: Unified Chunk Type Strategy
-- Purpose: Standardize how we identify and categorize chunks across all sources
-- Date: 2025-01-10

-- Step 1: Add source_type column to distinguish content sources
ALTER TABLE chunks 
ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'document';

-- Create enum-like constraint for source_type
ALTER TABLE chunks 
ADD CONSTRAINT chunks_source_type_check 
CHECK (source_type IN ('document', 'web', 'intake', 'api', 'manual'));

-- Step 2: Update existing web chunks to use unified pattern
-- Web chunks currently use chunk_type='atomic_web' or 'narrative_web'
-- Convert them to use chunk_subtype like documents do
UPDATE chunks 
SET 
  source_type = 'web',
  chunk_subtype = chunk_type,
  chunk_type = 'llm_dual'
WHERE source_url IS NOT NULL 
  AND chunk_type IN ('atomic_web', 'narrative_web');

-- Step 3: Ensure all document chunks have proper source_type
UPDATE chunks 
SET source_type = 'document'
WHERE source_url IS NULL 
  AND source_type IS NULL;

-- Step 4: Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_chunks_source_type 
ON chunks(source_type);

CREATE INDEX IF NOT EXISTS idx_chunks_unified_lookup 
ON chunks(client_id, chunk_type, chunk_subtype, source_type);

CREATE INDEX IF NOT EXISTS idx_chunks_category_lookup
ON chunks(client_id, atomic_category, source_type) 
WHERE atomic_category IS NOT NULL;

-- Step 5: Add comments for documentation
COMMENT ON COLUMN chunks.chunk_type IS 'Top-level categorization: llm_dual (default), semantic (legacy)';
COMMENT ON COLUMN chunks.chunk_subtype IS 'Specific chunk classification: atomic_amenity, narrative_location, etc.';
COMMENT ON COLUMN chunks.source_type IS 'Content source: document, web, intake, api, or manual';
COMMENT ON COLUMN chunks.atomic_category IS 'Category for atomic chunks: amenity, feature, location, pricing, lifestyle, special, community, cta, urgency';

