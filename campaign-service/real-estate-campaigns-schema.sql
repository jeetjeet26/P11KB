-- Real Estate Campaign Database Schema Extensions
-- Run this in your Supabase SQL Editor to extend the campaigns table
-- 
-- REAL ESTATE INTEGRATION APPROACH:
-- - product_name and target_audience are made nullable since they don't apply to real estate
-- - Real estate campaigns derive these values from client_intake data when available
-- - Real estate-specific fields (location_data, unit_details, etc.) provide detailed context
-- - The API automatically populates legacy fields for compatibility while using RE-specific fields

-- Add new columns to campaigns table for real estate campaigns
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ad_group_type TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS location_data JSONB;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS unit_details JSONB;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS proximity_targets TEXT[];
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS price_range TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS special_offers TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_demographic TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS character_validation JSONB;

-- Create index for faster campaign type and ad group filtering
CREATE INDEX IF NOT EXISTS idx_campaigns_campaign_type ON campaigns(campaign_type);
CREATE INDEX IF NOT EXISTS idx_campaigns_ad_group_type ON campaigns(ad_group_type);
CREATE INDEX IF NOT EXISTS idx_campaigns_client_type ON campaigns(client_id, campaign_type);

-- Update the campaigns table comments
COMMENT ON COLUMN campaigns.ad_group_type IS 'Real estate ad group type (location_general, 1br, near_landmarks, etc.)';
COMMENT ON COLUMN campaigns.location_data IS 'Location details including city, state, zipCode, county';
COMMENT ON COLUMN campaigns.unit_details IS 'Unit specifications including bedrooms, bathrooms, sqft, unitType';
COMMENT ON COLUMN campaigns.proximity_targets IS 'Array of proximity targets for proximity campaigns';
COMMENT ON COLUMN campaigns.price_range IS 'Price range or starting price information';
COMMENT ON COLUMN campaigns.special_offers IS 'Special offers, incentives, or promotions';
COMMENT ON COLUMN campaigns.target_demographic IS 'Target demographic description';
COMMENT ON COLUMN campaigns.character_validation IS 'Validation results for Google Ads character limits';

-- Make legacy fields nullable for real estate compatibility
ALTER TABLE campaigns ALTER COLUMN product_name DROP NOT NULL;
ALTER TABLE campaigns ALTER COLUMN target_audience DROP NOT NULL;

-- Ensure campaigns table has the basic structure
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    campaign_type TEXT NOT NULL,
    product_name TEXT, -- Nullable for real estate campaigns
    target_audience TEXT, -- Nullable for real estate campaigns  
    generated_copy JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Real estate specific columns (added above)
    ad_group_type TEXT,
    location_data JSONB,
    unit_details JSONB,
    proximity_targets TEXT[],
    price_range TEXT,
    special_offers TEXT,
    target_demographic TEXT,
    character_validation JSONB
);

-- Create updated_at trigger for campaigns table
CREATE OR REPLACE FUNCTION update_campaigns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_campaigns_updated_at ON campaigns;
CREATE TRIGGER update_campaigns_updated_at 
    BEFORE UPDATE ON campaigns 
    FOR EACH ROW 
    EXECUTE PROCEDURE update_campaigns_updated_at();

-- Create a view for real estate campaigns with enhanced data
CREATE OR REPLACE VIEW real_estate_campaigns AS
SELECT 
    c.*,
    cl.name as client_name,
    (c.location_data->>'city') as city,
    (c.location_data->>'state') as state,
    (c.unit_details->>'bedrooms') as bedrooms,
    (c.unit_details->>'bathrooms') as bathrooms,
    array_length(c.proximity_targets, 1) as proximity_target_count
FROM campaigns c
JOIN clients cl ON c.client_id = cl.id
WHERE c.campaign_type LIKE 're_%'
ORDER BY c.created_at DESC;

COMMENT ON VIEW real_estate_campaigns IS 'Enhanced view of real estate campaigns with flattened location and unit data'; 