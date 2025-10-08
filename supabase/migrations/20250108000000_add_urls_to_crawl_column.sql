-- Add urls_to_crawl column to client_intake table
-- This supports the new manual URL specification for web crawling

ALTER TABLE client_intake 
ADD COLUMN IF NOT EXISTS urls_to_crawl TEXT[];

-- Add column comment for documentation
COMMENT ON COLUMN client_intake.urls_to_crawl IS 
'Array of URLs to crawl for this client. Replaces auto-discovery with manual URL specification.';

-- Migrate existing property_url data to urls_to_crawl if needed
UPDATE client_intake 
SET urls_to_crawl = ARRAY[property_url] 
WHERE property_url IS NOT NULL 
  AND property_url != ''
  AND (urls_to_crawl IS NULL OR array_length(urls_to_crawl, 1) IS NULL);

-- Note: We keep property_url for backward compatibility but web crawler now uses urls_to_crawl

