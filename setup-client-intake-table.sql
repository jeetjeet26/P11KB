-- Setup script for client_intake table
-- Run this in your Supabase SQL Editor

-- Create client_intake table for storing client onboarding information
CREATE TABLE IF NOT EXISTS client_intake (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    
    -- Basic Information (already handled by client name)
    community_type TEXT DEFAULT 'Multifamily Apartments',
    
    -- Location Details
    community_address TEXT,
    
    -- Business Details
    price_point TEXT,
    property_url TEXT,
    
    -- Competitive Analysis
    competitors TEXT,
    unique_features TEXT,
    
    -- Local Market
    popular_activities TEXT,
    area_employers TEXT,
    school_district_notes TEXT,
    
    -- Target Audience
    target_audience TEXT,
    out_of_market_targets TEXT,
    referral_patterns TEXT,
    special_programs TEXT,
    
    -- Brand and Marketing
    brand_voice_guidelines TEXT,
    current_campaigns TEXT,
    
    -- Status tracking
    intake_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE client_intake IS 'Stores detailed client onboarding information and intake data.';

-- Create unique constraint to ensure one intake per client
CREATE UNIQUE INDEX IF NOT EXISTS client_intake_client_id_unique ON client_intake(client_id);

-- Add missing columns to chunks table that the edge function expects
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS document_type TEXT DEFAULT 'client_brand_asset';
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS chunk_type TEXT DEFAULT 'semantic';

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for automatic updated_at
DROP TRIGGER IF EXISTS update_client_intake_updated_at ON client_intake;
CREATE TRIGGER update_client_intake_updated_at 
    BEFORE UPDATE ON client_intake 
    FOR EACH ROW 
    EXECUTE PROCEDURE update_updated_at_column(); 