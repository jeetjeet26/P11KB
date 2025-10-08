-- =================================================================
-- CHUNK STATE VERIFICATION QUERIES
-- Run these to verify chunk utilization for ad copy generation
-- =================================================================

-- 1. Check what chunk_type values currently exist
SELECT 
  chunk_type,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM chunks
WHERE client_id = 'YOUR_CLIENT_ID'  -- Replace with actual client ID
GROUP BY chunk_type
ORDER BY count DESC;

-- Expected CURRENT (BEFORE fix):
-- chunk_type: 'atomic_web', count: ~50-100
-- chunk_type: 'narrative_web', count: ~30-50

-- Expected AFTER fix:
-- chunk_type: 'llm_dual', count: ~80-150


-- 2. Check chunk_subtype distribution
SELECT 
  chunk_type,
  chunk_subtype,
  COUNT(*) as count
FROM chunks
WHERE client_id = 'YOUR_CLIENT_ID'  -- Replace with actual client ID
GROUP BY chunk_type, chunk_subtype
ORDER BY chunk_type, count DESC
LIMIT 20;

-- Expected AFTER fix:
-- llm_dual | atomic_amenity | 15
-- llm_dual | atomic_lifestyle | 12
-- llm_dual | atomic_location | 8
-- llm_dual | narrative_amenities | 10
-- etc.


-- 3. Check source_type distribution (web vs document)
SELECT 
  chunk_type,
  source_type,
  COUNT(*) as count
FROM chunks
WHERE client_id = 'YOUR_CLIENT_ID'  -- Replace with actual client ID
GROUP BY chunk_type, source_type
ORDER BY count DESC;


-- 4. Check atomic_category distribution (critical for categorization)
SELECT 
  chunk_type,
  atomic_category,
  COUNT(*) as count
FROM chunks
WHERE client_id = 'YOUR_CLIENT_ID'  -- Replace with actual client ID
  AND atomic_category IS NOT NULL
GROUP BY chunk_type, atomic_category
ORDER BY count DESC;

-- Expected to see:
-- amenity, lifestyle, location, pricing, feature, community


-- 5. Check page_type distribution (for web chunks)
SELECT 
  chunk_type,
  page_type,
  COUNT(*) as count
FROM chunks
WHERE client_id = 'YOUR_CLIENT_ID'  -- Replace with actual client ID
  AND source_type = 'web'
GROUP BY chunk_type, page_type
ORDER BY count DESC;

-- Should see: homepage, amenities, gallery, pricing, location, etc.


-- 6. Sample chunks to verify content quality
SELECT 
  chunk_type,
  chunk_subtype,
  atomic_category,
  page_type,
  LEFT(content, 100) as content_preview,
  char_count
FROM chunks
WHERE client_id = 'YOUR_CLIENT_ID'  -- Replace with actual client ID
ORDER BY created_at DESC
LIMIT 10;


-- 7. Check if dual chunking would be available (this is what the system checks)
SELECT 
  COUNT(*) as dual_chunk_count,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ Dual chunking WOULD activate'
    ELSE '❌ Dual chunking WILL NOT activate (Traditional Mode)'
  END as status
FROM chunks
WHERE client_id = 'YOUR_CLIENT_ID'  -- Replace with actual client ID
  AND chunk_type = 'llm_dual'
  AND (chunk_subtype LIKE 'atomic_%' OR chunk_subtype LIKE 'narrative_%');


-- 8. Detailed breakdown by campaign focus
SELECT 
  chunk_type,
  atomic_category,
  page_type,
  COUNT(*) as count,
  ARRAY_AGG(DISTINCT LEFT(content, 50)) as sample_content
FROM chunks
WHERE client_id = 'YOUR_CLIENT_ID'  -- Replace with actual client ID
  AND chunk_type = 'llm_dual'  -- This will show 0 results BEFORE fix
GROUP BY chunk_type, atomic_category, page_type
ORDER BY count DESC;


-- 9. Check recent web crawl jobs
SELECT 
  id,
  website_url,
  status,
  pages_processed,
  chunks_created,
  started_at,
  completed_at
FROM web_crawl_jobs
WHERE client_id = 'YOUR_CLIENT_ID'  -- Replace with actual client ID
ORDER BY started_at DESC
LIMIT 5;


-- 10. Check web pages crawled and their chunk counts
SELECT 
  wp.url,
  wp.page_type,
  wp.page_title,
  wp.chunks_created,
  wp.processing_status,
  wp.processed_at
FROM web_pages wp
JOIN web_crawl_jobs wcj ON wp.crawl_job_id = wcj.id
WHERE wcj.client_id = 'YOUR_CLIENT_ID'  -- Replace with actual client ID
ORDER BY wp.processed_at DESC
LIMIT 10;


-- =================================================================
-- OPTIONAL: Update existing chunks (if you don't want to re-crawl)
-- =================================================================

-- WARNING: Only run this AFTER backing up your database!
-- This updates existing chunks to use the correct chunk_type

-- Update atomic_web chunks to llm_dual
UPDATE chunks
SET 
  chunk_type = 'llm_dual',
  chunk_subtype = CASE 
    WHEN atomic_category IS NOT NULL THEN CONCAT('atomic_', atomic_category)
    ELSE 'atomic_general'
  END
WHERE client_id = 'YOUR_CLIENT_ID'  -- Replace with actual client ID
  AND chunk_type = 'atomic_web';

-- Update narrative_web chunks to llm_dual  
UPDATE chunks
SET 
  chunk_type = 'llm_dual',
  chunk_subtype = CASE 
    WHEN page_type = 'amenities' THEN 'narrative_amenities'
    WHEN page_type = 'location' THEN 'narrative_location'
    WHEN page_type = 'homepage' THEN 'narrative_community'
    WHEN page_type = 'pricing' THEN 'narrative_pricing'
    ELSE 'narrative_general'
  END
WHERE client_id = 'YOUR_CLIENT_ID'  -- Replace with actual client ID
  AND chunk_type = 'narrative_web';

-- Verify the update worked
SELECT 
  chunk_type,
  chunk_subtype,
  COUNT(*) as count
FROM chunks
WHERE client_id = 'YOUR_CLIENT_ID'  -- Replace with actual client ID
GROUP BY chunk_type, chunk_subtype
ORDER BY chunk_type, count DESC;

