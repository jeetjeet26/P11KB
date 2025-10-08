-- Migration: Add Consolidated Metadata JSONB Column
-- Purpose: Consolidate metadata fields into flexible JSONB structure
-- Date: 2025-01-10

-- Step 1: Add metadata JSONB column
ALTER TABLE chunks 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Step 2: Migrate existing metadata fields into JSONB
-- This preserves the existing columns but also populates the new consolidated field
UPDATE chunks 
SET metadata = jsonb_build_object(
  'atomic_category', atomic_category,
  'campaign_focus', campaign_focus,
  'amenity_category', amenity_category,
  'location_type', location_type,
  'price_type', price_type,
  'is_pet_related', COALESCE(is_pet_related, false),
  'offer_expiry', offer_expiry,
  'floor_plan_bedrooms', floor_plan_bedrooms,
  'char_count', char_count,
  'page_type', page_type,
  'content_language', COALESCE(content_language, 'en')
)
WHERE metadata = '{}'::jsonb;

-- Remove null values from metadata (cleaner JSON)
UPDATE chunks 
SET metadata = (
  SELECT jsonb_object_agg(key, value)
  FROM jsonb_each(metadata)
  WHERE value IS NOT NULL AND value::text != 'null'
)
WHERE metadata != '{}'::jsonb;

-- Step 3: Create GIN index for fast JSONB querying
CREATE INDEX IF NOT EXISTS idx_chunks_metadata_gin 
ON chunks USING GIN (metadata);

-- Step 4: Create specialized indexes for common metadata queries
CREATE INDEX IF NOT EXISTS idx_chunks_metadata_atomic_category 
ON chunks ((metadata->>'atomic_category')) 
WHERE metadata->>'atomic_category' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chunks_metadata_campaign_focus 
ON chunks USING GIN ((metadata->'campaign_focus')) 
WHERE metadata->'campaign_focus' IS NOT NULL;

-- Step 5: Add validation function for metadata schema
CREATE OR REPLACE FUNCTION validate_chunk_metadata(meta JSONB) 
RETURNS BOOLEAN AS $$
BEGIN
  -- Validate atomic_category values
  IF meta->>'atomic_category' IS NOT NULL THEN
    IF NOT (meta->>'atomic_category' IN ('amenity', 'feature', 'location', 'pricing', 'lifestyle', 'special', 'community', 'cta', 'urgency')) THEN
      RETURN FALSE;
    END IF;
  END IF;
  
  -- Validate amenity_category values
  IF meta->>'amenity_category' IS NOT NULL THEN
    IF NOT (meta->>'amenity_category' IN ('fitness', 'social', 'convenience', 'outdoor')) THEN
      RETURN FALSE;
    END IF;
  END IF;
  
  -- Validate location_type values
  IF meta->>'location_type' IS NOT NULL THEN
    IF NOT (meta->>'location_type' IN ('proximity', 'neighborhood', 'transit')) THEN
      RETURN FALSE;
    END IF;
  END IF;
  
  -- Validate price_type values
  IF meta->>'price_type' IS NOT NULL THEN
    IF NOT (meta->>'price_type' IN ('starting_at', 'range', 'average')) THEN
      RETURN FALSE;
    END IF;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Add constraint using validation function
ALTER TABLE chunks 
ADD CONSTRAINT chunks_metadata_valid 
CHECK (validate_chunk_metadata(metadata));

COMMENT ON COLUMN chunks.metadata IS 'Consolidated metadata as JSONB. Includes atomic_category, campaign_focus, amenity_category, location_type, price_type, is_pet_related, offer_expiry, floor_plan_bedrooms, char_count, page_type, content_language';
COMMENT ON FUNCTION validate_chunk_metadata IS 'Validates chunk metadata JSONB structure and enum values';

-- Step 6: Note for future deprecation
-- The individual metadata columns (atomic_category, amenity_category, etc.) are kept for backward compatibility
-- They can be deprecated in a future migration after all code uses the metadata JSONB column
COMMENT ON COLUMN chunks.atomic_category IS 'DEPRECATED: Use metadata->>''atomic_category'' instead. Kept for backward compatibility.';
COMMENT ON COLUMN chunks.amenity_category IS 'DEPRECATED: Use metadata->>''amenity_category'' instead. Kept for backward compatibility.';
COMMENT ON COLUMN chunks.location_type IS 'DEPRECATED: Use metadata->>''location_type'' instead. Kept for backward compatibility.';
COMMENT ON COLUMN chunks.price_type IS 'DEPRECATED: Use metadata->>''price_type'' instead. Kept for backward compatibility.';

