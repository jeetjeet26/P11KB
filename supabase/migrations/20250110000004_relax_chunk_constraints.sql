-- Relax overly strict constraints on chunks table to accept LLM-generated values
-- This fixes the constraint violation errors during web crawling

-- Drop existing overly restrictive constraints
ALTER TABLE chunks DROP CONSTRAINT IF EXISTS check_amenity_category;
ALTER TABLE chunks DROP CONSTRAINT IF EXISTS check_price_type;
ALTER TABLE chunks DROP CONSTRAINT IF EXISTS check_location_type;

-- Add more permissive constraints with expanded value sets

-- Amenity categories - expanded to cover real estate scenarios
ALTER TABLE chunks ADD CONSTRAINT check_amenity_category 
CHECK (
  amenity_category IS NULL OR 
  amenity_category IN (
    'fitness', 'social', 'convenience', 'outdoor',
    'pet', 'pets', 'community', 'recreation', 'wellness',
    'parking', 'security', 'technology', 'business',
    'pool', 'spa', 'entertainment', 'dining', 'kitchen',
    'laundry', 'storage', 'maintenance', 'other'
  )
);

-- Price types - expanded to cover various pricing formats
ALTER TABLE chunks ADD CONSTRAINT check_price_type 
CHECK (
  price_type IS NULL OR 
  price_type IN (
    'starting_at', 'range', 'average',
    'from', 'starting', 'per_month', 'monthly',
    'call_for_pricing', 'contact', 'varies',
    'special', 'promotion', 'exact', 'estimate',
    'lease_special', 'move_in_special', 'other'
  )
);

-- Location types - expanded to cover various location information
ALTER TABLE chunks ADD CONSTRAINT check_location_type 
CHECK (
  location_type IS NULL OR 
  location_type IN (
    'proximity', 'neighborhood', 'transit',
    'nearby', 'distance', 'accessibility',
    'commute', 'walkability', 'local',
    'address', 'area', 'region', 'district',
    'landmark', 'poi', 'other'
  )
);

-- Add index comments for documentation
COMMENT ON CONSTRAINT check_amenity_category ON chunks IS 
  'Expanded amenity categories to accommodate LLM-generated classifications';

COMMENT ON CONSTRAINT check_price_type ON chunks IS 
  'Expanded price types to accommodate various pricing formats from web content';

COMMENT ON CONSTRAINT check_location_type ON chunks IS 
  'Expanded location types to accommodate diverse location information';

