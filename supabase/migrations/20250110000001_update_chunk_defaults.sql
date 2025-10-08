-- Migration: Update Chunk Table Defaults
-- Purpose: Align database defaults with actual system usage
-- Date: 2025-01-10

-- Step 1: Update chunk_type default to match actual usage
ALTER TABLE chunks 
ALTER COLUMN chunk_type SET DEFAULT 'llm_dual';

-- Step 2: Make document_type required and update default
ALTER TABLE chunks 
ALTER COLUMN document_type SET DEFAULT 'multifamily_property';

-- Step 3: Make source_type NOT NULL (now that we've backfilled data)
ALTER TABLE chunks 
ALTER COLUMN source_type SET NOT NULL;

-- Step 4: Add validation constraints
ALTER TABLE chunks 
ADD CONSTRAINT chunks_document_type_check 
CHECK (document_type IN ('looker_report', 'client_brand_asset', 'multifamily_property', 'web_content'));

-- Step 5: Update chunk_type constraint to include only valid values
ALTER TABLE chunks 
DROP CONSTRAINT IF EXISTS chunks_chunk_type_check;

ALTER TABLE chunks 
ADD CONSTRAINT chunks_chunk_type_check 
CHECK (chunk_type IN ('llm_dual', 'semantic', 'manual'));

COMMENT ON COLUMN chunks.chunk_type IS 'Chunking strategy: llm_dual (AI-powered dual chunking), semantic (legacy), manual (user-created)';
COMMENT ON COLUMN chunks.document_type IS 'Type of source document: looker_report, client_brand_asset, multifamily_property, web_content';

