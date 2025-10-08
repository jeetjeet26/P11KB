-- Web Crawling Feature Database Schema
-- Migration for web crawling implementation
-- Created: 2025-09-29

-- ===== PHASE 1: DATABASE SCHEMA ENHANCEMENTS =====

-- Step 1.1: Update chunks table schema for web content metadata
-- Add web content metadata columns to chunks table
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS page_title TEXT;
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS page_type TEXT; -- 'homepage', 'amenities', 'gallery', 'contact', 'about', 'pricing'
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS crawl_timestamp TIMESTAMPTZ;
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS content_language TEXT DEFAULT 'en';

-- Add indexes for efficient web content querying
CREATE INDEX IF NOT EXISTS idx_chunks_source_url ON chunks(source_url);
CREATE INDEX IF NOT EXISTS idx_chunks_page_type ON chunks(page_type);
CREATE INDEX IF NOT EXISTS idx_chunks_crawl_timestamp ON chunks(crawl_timestamp);

-- Step 1.2: Update sources table for web crawling support
-- Ensure sources table supports web crawling
ALTER TABLE sources ADD COLUMN IF NOT EXISTS url_crawled TEXT;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS crawl_status TEXT DEFAULT 'pending'; -- 'pending', 'in_progress', 'completed', 'failed'

-- Step 1.3: Create web crawling status tracking table
CREATE TABLE IF NOT EXISTS web_crawl_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    website_url TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'failed'
    pages_found INTEGER DEFAULT 0,
    pages_processed INTEGER DEFAULT 0,
    chunks_created INTEGER DEFAULT 0,
    error_message TEXT,
    crawl_settings JSONB DEFAULT '{}', -- Store crawling configuration
    discovered_pages TEXT[], -- Array of discovered page URLs
    excluded_pages TEXT[], -- Array of pages to exclude
    robots_txt_compliant BOOLEAN DEFAULT true,
    sitemap_url TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for web crawl jobs
CREATE INDEX IF NOT EXISTS idx_web_crawl_jobs_client_id ON web_crawl_jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_web_crawl_jobs_status ON web_crawl_jobs(status);
CREATE INDEX IF NOT EXISTS idx_web_crawl_jobs_website_url ON web_crawl_jobs(website_url);
CREATE INDEX IF NOT EXISTS idx_web_crawl_jobs_created_at ON web_crawl_jobs(created_at);

-- Add unique constraint to prevent duplicate crawling jobs for same URL within 24 hours
CREATE UNIQUE INDEX IF NOT EXISTS idx_web_crawl_jobs_unique_recent 
ON web_crawl_jobs(client_id, website_url) 
WHERE created_at > NOW() - INTERVAL '24 hours' AND status IN ('pending', 'in_progress');

-- Step 1.4: Create web page metadata table for detailed tracking
CREATE TABLE IF NOT EXISTS web_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    crawl_job_id UUID REFERENCES web_crawl_jobs(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    page_title TEXT,
    page_type TEXT,
    content_length INTEGER,
    processing_status TEXT DEFAULT 'pending', -- 'pending', 'processed', 'failed', 'skipped'
    chunks_created INTEGER DEFAULT 0,
    meta_description TEXT,
    h1_headings TEXT[],
    error_message TEXT,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for web pages
CREATE INDEX IF NOT EXISTS idx_web_pages_crawl_job_id ON web_pages(crawl_job_id);
CREATE INDEX IF NOT EXISTS idx_web_pages_url ON web_pages(url);
CREATE INDEX IF NOT EXISTS idx_web_pages_page_type ON web_pages(page_type);
CREATE INDEX IF NOT EXISTS idx_web_pages_processing_status ON web_pages(processing_status);

-- Step 1.5: Update client_intake table to track web crawling preference
ALTER TABLE client_intake ADD COLUMN IF NOT EXISTS enable_web_crawling BOOLEAN DEFAULT true;
ALTER TABLE client_intake ADD COLUMN IF NOT EXISTS crawl_exclude_patterns TEXT[]; -- Patterns to exclude during crawling
ALTER TABLE client_intake ADD COLUMN IF NOT EXISTS max_pages_to_crawl INTEGER DEFAULT 15;

-- Step 1.6: Create updated_at trigger for web_crawl_jobs
CREATE OR REPLACE FUNCTION update_web_crawl_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_web_crawl_jobs_updated_at ON web_crawl_jobs;
CREATE TRIGGER update_web_crawl_jobs_updated_at 
    BEFORE UPDATE ON web_crawl_jobs 
    FOR EACH ROW 
    EXECUTE PROCEDURE update_web_crawl_jobs_updated_at();

-- Step 1.7: Add comments for documentation
COMMENT ON TABLE web_crawl_jobs IS 'Tracks web crawling jobs for client websites with status and metadata';
COMMENT ON TABLE web_pages IS 'Detailed tracking of individual pages processed during web crawling';

COMMENT ON COLUMN chunks.source_url IS 'Original URL of the web page this chunk was extracted from';
COMMENT ON COLUMN chunks.page_title IS 'Title of the web page this chunk came from';
COMMENT ON COLUMN chunks.page_type IS 'Type of web page (homepage, amenities, gallery, contact, about, pricing)';
COMMENT ON COLUMN chunks.crawl_timestamp IS 'Timestamp when this content was crawled from the web';
COMMENT ON COLUMN chunks.content_language IS 'Language of the web content, defaults to English';

COMMENT ON COLUMN sources.url_crawled IS 'Base URL that was crawled to generate this source';
COMMENT ON COLUMN sources.crawl_status IS 'Status of the crawling process for this source';

COMMENT ON COLUMN web_crawl_jobs.crawl_settings IS 'JSON configuration for crawling parameters and options';
COMMENT ON COLUMN web_crawl_jobs.discovered_pages IS 'Array of all page URLs discovered during crawling';
COMMENT ON COLUMN web_crawl_jobs.excluded_pages IS 'Array of page URLs that were excluded from processing';
COMMENT ON COLUMN web_crawl_jobs.robots_txt_compliant IS 'Whether the crawling respects robots.txt directives';

-- Step 1.8: Create view for web content analytics
CREATE OR REPLACE VIEW web_content_analytics AS
SELECT 
    wcj.client_id,
    cl.name as client_name,
    wcj.website_url,
    wcj.status as crawl_status,
    wcj.pages_found,
    wcj.pages_processed,
    wcj.chunks_created,
    wcj.created_at as crawl_started,
    wcj.completed_at as crawl_completed,
    COUNT(c.id) as total_chunks_in_db,
    COUNT(DISTINCT c.page_type) as unique_page_types,
    array_agg(DISTINCT c.page_type) FILTER (WHERE c.page_type IS NOT NULL) as page_types_found
FROM web_crawl_jobs wcj
JOIN clients cl ON wcj.client_id = cl.id
LEFT JOIN chunks c ON c.client_id = wcj.client_id AND c.source_url IS NOT NULL
GROUP BY wcj.id, cl.name
ORDER BY wcj.created_at DESC;

COMMENT ON VIEW web_content_analytics IS 'Analytics view showing web crawling results and chunk generation statistics';

-- Step 1.9: Row Level Security (RLS) policies for new tables
ALTER TABLE web_crawl_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_pages ENABLE ROW LEVEL SECURITY;

-- RLS policy: Users can only access their own client's crawl jobs
CREATE POLICY "Users can view their own client crawl jobs" ON web_crawl_jobs
    FOR ALL USING (auth.uid() IN (
        SELECT user_id FROM clients WHERE id = client_id
    ));

-- RLS policy: Users can only access web pages from their own crawl jobs
CREATE POLICY "Users can view their own crawl job pages" ON web_pages
    FOR ALL USING (crawl_job_id IN (
        SELECT wcj.id FROM web_crawl_jobs wcj
        JOIN clients c ON wcj.client_id = c.id
        WHERE c.user_id = auth.uid()
    ));

-- Grant necessary permissions
GRANT ALL ON web_crawl_jobs TO authenticated;
GRANT ALL ON web_pages TO authenticated;
GRANT SELECT ON web_content_analytics TO authenticated;

